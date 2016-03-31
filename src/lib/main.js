var contextMenu = require('sdk/context-menu')
var pageMod = require('sdk/page-mod')
var self = require('sdk/self')
var xhr = require('sdk/net/xhr')
var simpleStorage = require('sdk/simple-storage').storage
var panels = require('sdk/panel')
var tabs = require('sdk/tabs')
var url = require('sdk/url')
var prefs = require('sdk/simple-prefs')
var cookieutil = require('./cookieutil')
const file = require("sdk/io/file");
var {Cc, Ci} = require("chrome");

var SITEINFO_IMPORT_URLS = [
    'http://wedata.net/databases/AutoPagerize/items_all.json',
]
var CACHE_EXPIRE = 24 * 60 * 60 * 1000
var siteinfo = {}
var launched = {}
// var settings = {}
var excludes = [
    'https://mail.google.com/*',
    'http://b.hatena.ne.jp/*',
    'http://www.facebook.com/plugins/like.php*',
    'http://api.tweetmeme.com/button.js*'
]
var loading_html = ''
var error_html = ''

if (!('responseURL' in new xhr.XMLHttpRequest())) {
    xhr.XMLHttpRequest.prototype.__defineGetter__(
        'responseURL',
        function () {
            return (this._req ? this._req.channel : this.channel).URI.spec
        })
}

exports.main = function (options, callbacks) {
    if (simpleStorage.settings) {
        // remove obsolete settings.
        var mysettings = JSON.parse(simpleStorage.settings)
        if (mysettings.loading_html || mysettings.error_html) {
            delete mysettings.loading_html
            delete mysettings.error_html
            simpleStorage.settings = JSON.stringify(mysettings)
        }
    } else {
        var defaultSettings = {
            // iframe can not load "self.data.url('')" on Firefox.
            // extension_path: self.data.url(''),
            display_message_bar: true,
            exclude_patterns: simpleStorage.exclude_patterns || ''
        }
        simpleStorage.settings = JSON.stringify(defaultSettings)
    }
    loading_html = self.data.load('loading.html.data')
    error_html = self.data.load('error.html.data')

    loadLocalSiteinfoCallback(JSON.parse(self.data.load('items.json')))

    pageMod.PageMod({
        include: ['http://*', 'https://*'],
        contentScriptWhen: 'ready',
        contentScriptFile: [
            self.data.url('extension.js'),
            self.data.url('autopagerize.user.js')
        ],
        onAttach: onAttach
    })

    contextMenu.Menu({
        label: "NextPagerize",
        context: contextMenu.PageContext(),
        contentScriptFile: self.data.url('context_menu.js'),
        items: [
            contextMenu.Item({
                label: "on/off",
                data: "toggle"
            }),
            contextMenu.Item({
                label: "config",
                data: "config"
            })
        ],
        onMessage: function (message) {
            if (message == 'show_config_panel') {
                configPanel.show()
            } else if (message == 'toggle') {
                var settings = JSON.parse(simpleStorage.settings)
                postEvent(settings.disable ? 'AutoPagerizeEnableRequest' : 'AutoPagerizeDisableRequest')
                settings.disable = !settings.disable
                simpleStorage.settings = JSON.stringify(settings)
            }
        }
    })

    prefs.on('openPref', function (tab) {
        tabs.open({
            url: self.data.url("options.html"),
            onReady: function (tab) {
                //console.log('ready', tab.url);
                var worker = tab.attach({
                    contentScriptFile: [
                        self.data.url("jquery-1.12.1.min.js"),
                        self.data.url("bootstrap-3.3.6-dist/js/bootstrap.min.js"),
                        self.data.url("jquery.watable.js"),
                        self.data.url("options.js")
                    ],
                    contentScriptWhen: 'ready',
                    onMessage: function (message) {
                        console.log(message);
                        if (message.name == 'settings') {
                            worker.postMessage({
                                name: message.name,
                                data: JSON.parse(simpleStorage.settings)
                            })
                        } else if (message.name == 'settingsUpdate') {
                            simpleStorage.settings = JSON.stringify(message.data)
                            postEvent('NextPagerizeUpdateSettingsRequest')
                            postEvent(message.data.disable ? 'AutoPagerizeDisableRequest' : 'AutoPagerizeEnableRequest')
                        } else if (message.name == 'siteinfo_meta') {
                            var u = SITEINFO_IMPORT_URLS[0]
                            var len = siteinfo[u].info.length
                            var updated_at = siteinfo[u].expire - CACHE_EXPIRE
                            worker.postMessage({
                                name: message.name,
                                len: len,
                                updated_at: updated_at
                            })
                        } else if (message.name == 'update_siteinfo') {
                            //console.log('update_siteinfo');
                            refreshSiteinfo({
                                force: true,
                                callback: function () {
                                    worker.postMessage({
                                        name: message.name,
                                        res: 'ok'
                                    })
                                }
                            })
                        } else if (message.name == 'get_cacheinfo') {
                            console.log('main: get_cacheinfo');
                            worker.postMessage({
                                name: message.name,
                                data: simpleStorage.all_cache_obj || {}
                            });
                        } else if (message.name == 'edit_siteinfo') {
                            modifyCustomSiteinfo(message.data, function(all_cache_obj){
                                worker.postMessage({
                                    name: 'get_cacheinfo',
                                    data: all_cache_obj
                                });
                            });
                        }
                    }
                });
            },
        });
    });
}

function onAttach(worker) {
    // skip about scheme page like "about:addons".
    if (/^about:/.test(worker.tab.url)) {
        return
    }

    worker.on('error', function (error) {
        console.error(error.message)
    })
    worker.on('message', function (message) {
        if (message.name == 'settings') {
            var res = JSON.parse(simpleStorage.settings)
            res.exclude_patterns += ' ' + excludes.join(' ')
            res.loading_html = loading_html
            res.error_html = error_html
            worker.postMessage({
                name: 'settings',
                data: res
            })
        } else if (message.name == 'siteinfo') {
            var res_ = SITEINFO_IMPORT_URLS.reduce(function (r, url) {
                return r.concat(siteinfo[url].info)
            }, []).filter(function (s) {
                try {
                    return message.data.url.match(s.url)
                } catch (e) {
                    console.log(e)
                    return false
                }
            })

            worker.postMessage({
                name: 'siteinfo',
                data: res_
            })
        } else if (message.name == 'launched') {
            launched[message.data.url] = true
        } else if (message.name == 'get') {
            var cookie = cookieutil.getCookie(message.data.fromURL, message.data.url)
            get(message.data.url, function (res) {
                var issame = cookieutil.isSameOrigin(
                    message.data.fromURL, res.responseURL)
                var d = {
                    responseText: issame ? res.responseText : null,
                    responseURL: res.responseURL
                }
                worker.postMessage({
                    name: 'get',
                    data: d
                })
            }, {
                charset: message.data.charset,
                cookie: cookie
            })
        } else {
            console.log('else')
        }
    })
}

function loadLocalSiteinfoCallback(data) {
    var url = SITEINFO_IMPORT_URLS[0]
    var url_old = 'http://wedata.net/databases/AutoPagerize/items.json'
    var cache = JSON.parse(simpleStorage.cacheInfo || '{}')
    console.log('loadLocalSiteinfoCallback');
    if (!cache[url]) {
        siteinfo[url] = {
            url: url,
            expire: new Date().getTime() - 1,
            info: reduceWedataJSON(data),
            items: data
        }
        cache[url] = siteinfo[url]
        simpleStorage.cacheInfo = JSON.stringify(cache)
    } else {
        siteinfo[url] = cache[url]
    }

    // remove old url cache
    if (cache[url_old]) {
        delete cache[url_old]
        simpleStorage.cacheInfo = JSON.stringify(cache)
    }

    simpleStorage.all_cache_obj = genAllCacheObject(cache);
    refreshSiteinfo({
        callback: updateCacheInfoByCustomSiteinfo
    });
}

function reduceWedataJSON(data) {
    var r_keys = ['url', 'nextLink', 'insertBefore', 'pageElement']
    var info = data.map(function (i) {
        return i.data
    }).filter(function (i) {
        return ('url' in i)
    })
    if (info.length === 0) {
        return []
    } else {
        info.sort(function (a, b) {
            return (b.url.length - a.url.length)
        })
        return info.map(function (i, index) {
            var item = {}
            r_keys.forEach(function (key) {
                if (i[key]) {
                    item[key] = i[key]
                }
                item['name'] = data[index]['name']
            })
            return item
        })
    }
}

function refreshSiteinfo(opt) {
    opt = opt || {}
    var cache = JSON.parse(simpleStorage.cacheInfo || '{}')
    SITEINFO_IMPORT_URLS.forEach(function (url) {
        if (opt.force || !cache[url] || (cache[url].expire && new Date(cache[url].expire) < new Date())) {
            var callback = function (res) {
                if (res.status != 200) {
                    return
                }

                var data = JSON.parse(res.responseText)
                var info = reduceWedataJSON(data)
                if (info.length === 0) {
                    return
                }
                siteinfo[url] = {
                    url: url,
                    expire: new Date().getTime() + CACHE_EXPIRE,
                    info: info,
                    items: data
                }
                cache[url] = siteinfo[url]
                simpleStorage.cacheInfo = JSON.stringify(cache)
                simpleStorage.all_cache_obj = genAllCacheObject(cache);
                console.log('get siteinfo completed, and modifyCustomSiteinfo');
                if (opt.callback) {
                    opt.callback()
                }
            }
            try {
                get(url, callback)
            } catch (e) {
                console.log('get fail', e)
            }
        }
    })
}

function get(url, callback, opt) {
    opt = opt || {}
    var req = new xhr.XMLHttpRequest()
    req.onreadystatechange = function () {
        if (req.readyState == 4) {
            callback(req)
        }
    }
    req.open('GET', url, true)
    if (opt.charset) {
        req.overrideMimeType('text/html; charset=' + opt.charset)
    }
    if (opt.cookie) {
        req.setRequestHeader('Cookie', opt.cookie)
    }
    req.send(null)
    return req
}

function postEvent(name) {
    var cs = "var ev = document.createEvent('Event');" +
        "ev.initEvent('" + name + "', true, false);" +
        "document.dispatchEvent(ev);"
    attachAll(cs)
}

function attachAll(contentScript, urlpattern) {
    for (var i in tabs) {
        if (!urlpattern || urlpattern.match(tabs[i].url)) {
            tabs[i].attach({
                contentScript: contentScript
            })
        }
    }
}

//  Modify function name
function genAllCacheObject(all_cacheInfo) {
    console.log('genAllCacheObject');
    var cacheInfo = {}; 
    for (var k in all_cacheInfo) {
        // console.log('loadCacheInfoDetail for in', cacheInfo);
        for (var i in all_cacheInfo[k]['items']) {
            var item_name = all_cacheInfo[k]['items'][i]['name'];
            cacheInfo[item_name] = all_cacheInfo[k]['items'][i];
        }
    }

    // console.log(cacheInfo);
    return JSON.stringify(cacheInfo);
}


function getCustomSiteInfoFilename() {
    let storeFile = Cc["@mozilla.org/file/directory_service;1"].
                    getService(Ci.nsIProperties).
                    get("ProfD", Ci.nsIFile);
    storeFile.append('jetpack');
    storeFile.append(self.id);
    storeFile.append("simple-storage");
    file.mkpath(storeFile.path);
    storeFile.append("custome_siteinfo.json");
    return storeFile.path;
}

var customSiteInfoFilename = getCustomSiteInfoFilename();
console.log('customSiteInfoFilename:', customSiteInfoFilename);
function readCustomSiteInfo() {
    try {
        let str = file.read(customSiteInfoFilename);
        return str
    }
    catch (err) {
        console.error('readCustomSiteInfo error:', err.message);
        return '';
    }
}

function writeCustomSiteInfo(custome_siteinfo_str) {
    let stream = file.open(customSiteInfoFilename, "w");
    try {
        stream.write(custome_siteinfo_str);
    }
    catch (err) {
        console.error('writeCustomSiteInfo error:', err.message);
    }
    stream.close();
}

function updateCacheInfoByCustomSiteinfo(cb) {
    console.log('updateCacheInfoByCustomSiteinfo');
    var customSiteInfoFile = readCustomSiteInfo();
    if (!customSiteInfoFile && !simpleStorage.cacheInfo)
        return;

    console.log('simpleStorage.customSiteInfo:', customSiteInfoFile);
    var customSiteInfo = JSON.parse(customSiteInfoFile || '{}');
    var all_cacheInfo = JSON.parse(simpleStorage.cacheInfo);

    for (var k in all_cacheInfo) {
        // console.log('loadCacheInfoDetail for in', cacheInfo);
        var item_name = '';
        for (var i in all_cacheInfo[k]['items']) {
            item_name = all_cacheInfo[k]['items'][i]['name'];
            if (item_name in customSiteInfo 
                && all_cacheInfo[k]['items'][i]['name'] == customSiteInfo[item_name]['name']) {
                all_cacheInfo[k]['items'][i]['data']['url'] = customSiteInfo[item_name]['url'];
                all_cacheInfo[k]['items'][i]['data']['nextLink'] = customSiteInfo[item_name]['nextLink'];
                all_cacheInfo[k]['items'][i]['data']['pageElement'] = customSiteInfo[item_name]['pageElement'];
            }
        }
        all_cacheInfo[k]['info'] = reduceWedataJSON(all_cacheInfo[k]['items']);
        siteinfo[k] = all_cacheInfo[k]
    }
    simpleStorage.cacheInfo = JSON.stringify(all_cacheInfo);
    simpleStorage.all_cache_obj = genAllCacheObject(all_cacheInfo);
    
    cb && cb(simpleStorage.all_cache_obj);
}

function modifyCustomSiteinfo(item_name, cb) {
    var all_cache_obj = JSON.parse(simpleStorage.all_cache_obj);
    // console.log(item_name)
    var edit_panel = panels.Panel({
        width: 500,
        height: 520,
        contentURL: self.data.url('item_editor.html'),
        contentScriptFile: [
                        self.data.url("jquery-1.12.1.min.js"),
                        // self.data.url("bootstrap-3.3.6-dist/js/bootstrap.min.js"),
                        self.data.url('item_editor.js')],
        contentScriptWhen: 'ready',
        onShow: function() {
            edit_panel.postMessage({
                name: 'onshow',
                data: all_cache_obj[item_name]
            })
        },
       onMessage: function (message) {
            if (message.name == 'save') {
                if (message.isModified) {
                    // Modify cacheInfo for enable change
                    updateCustomSiteInfo(message.data);
                    updateCacheInfoByCustomSiteinfo(cb);
                }
                edit_panel.destroy();
            }
        }
    }).show();
    // console.log('modifyCustomSiteinfo', item_name);
}

// Save custom site info to simpleStorage
function updateCustomSiteInfo(data) {
    var customSiteInfoFile = readCustomSiteInfo();
    var customSiteInfo = JSON.parse(customSiteInfoFile || '{}');
    customSiteInfo[data['name']] = data;
    console.log('update customSiteInfo:', customSiteInfo);
    writeCustomSiteInfo(JSON.stringify(customSiteInfo));
}