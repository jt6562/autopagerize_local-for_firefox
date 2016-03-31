var form = document.getElementById('settings_form');
var form_ep = document.getElementById('form_ep')
var form_dm = document.getElementById('form_dm')
var form_disable = document.getElementById('form_disable')
form && form.addEventListener('submit', function (event) {
    var d = {}
    d.exclude_patterns = form_ep.value
    d.display_message_bar = !!form_dm.checked
    d.disable = !!form_disable.checked
    self.postMessage({
        name: 'settingsUpdate',
        data: d
    })
    event.preventDefault()
}, false)

var us = document.getElementById('update_siteinfo')
us.addEventListener('click', updateCacheInfo, false)

self.on('message', function (res) {
    console.log('options.js:onMessage', res.name)
    if (res.name == 'settings') {
        var settings = res.data
        form_ep.value = settings.exclude_patterns || ''
        form_dm.checked = settings.display_message_bar === false ? false : 'checked'
        form_disable.checked = settings.disable ? 'checked' : null
    } else if (res.name == 'siteinfo_meta') {
        if (res.len) {
            document.getElementById('siteinfo_size').textContent = res.len
        }
        if (res.updated_at) {
            var d = new Date(res.updated_at)
            document.getElementById('siteinfo_updated_at').textContent = d
        }
    } else if (res.name == 'update_siteinfo') {
        if (res.res == 'ok') {
            updateCacheInfoInfo()
            us.disabled = false
            us.value = 'update_siteinfo'
        }
    } else if (res.name == 'onshow') {
        console.log('onshow');
        onshow();
    } else if (res.name == 'get_cacheinfo') {
        loadCacheInfoDetail(res.data);
    }
})

function onshow() {
    self.postMessage({
        name: 'settings'
    })

    // Load site info table data
    self.postMessage({
        name: 'get_cacheinfo'
    });
    updateCacheInfoInfo()
}
onshow();

function updateCacheInfoInfo() {
    self.postMessage({
        name: 'siteinfo_meta'
    })

    // Update site info table data
    self.postMessage({
        name: 'get_cacheinfo'
    });
}

function updateCacheInfo() {
    us.disabled = true
    us.value = 'Updateing...'
    self.postMessage({
        name: 'update_siteinfo'
    })


}

var update_table = document.getElementById('update_table');
update_table.addEventListener('click', updateCacheInfoTable, false);

function updateCacheInfoTable() {
    self.postMessage({
        name: 'get_cacheinfo'
    });
}

var detailTable = undefined;
function loadCacheInfoDetail(cacheInfoStr) {
    console.log('loadCacheInfoDetail');
    cacheInfo = JSON.parse(cacheInfoStr);
    var cacheList = [];
    for (var i in cacheInfo) {
        cacheList.push(cacheInfo[i]);
    }
    if (!detailTable) {
        console.log('Create table');
        detailTable = $('#siteinfo_table').WATable({
            dataBind: true,  
            filter: true,
            debug: false,
            rowClicked: function(rowData) {
                rowData && rowData.row && self.postMessage({
                    name: 'edit_siteinfo',
                    data: rowData.row.Name
                });
            }
        }).data('WATable');
    }
    console.log('Update table content', cacheList.length);
    detailTable.setData(formatTableData(cacheList));
}

function formatTableData(cacheInfoArray) {
    var cols = {
        No: {
            index: 1,
            type: "number",
            sortOrder: "asc",
            unique: true
        },
        Name: {
            index: 2,
            type: "string",
            filter: "",
            placeholder: "",
            
        },
        URL: {
            index: 3,
            type: "string",
            filter: "",
            placeholder: ""
        },
        NextLink: {
            index: 4,
            type: "string",
            filter: false
        },
        PageElement: {
            index: 5,
            type: "string",
            filter: false
        },
        UpdatedAt: {
            index: 6,
            type: "string",
            filter: false
        }
    };

    var rows = [];
    for (var i = 0; i < cacheInfoArray.length; i++) {
        var item = cacheInfoArray[i];
        var row = {};
        row.No = i+1;
        row.Name = item['name'];
        row.URL = item['data'] ? item['data']['url']: '';
        row.NextLink = item['data'] ? item['data']['nextLink']: '';
        row.PageElement = item['data'] ? item['data']['pageElement']: '';
        row.UpdatedAt = item['updated_at'];
        rows.push(row);
    }
    var data = {
        cols: cols,
        rows: rows,
        otherStuff: {thatIMight:1 , needLater: true}
    };
    // console.log('table data', data);
    return data;
}
