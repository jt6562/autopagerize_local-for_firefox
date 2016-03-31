# AutoPagerize Firefox Extension with local rules

This extension is modified base on [AutoPagerize](https://github.com/swdyh/autopagerize_for_firefox).
Add a table that getting/setting all matching rules to options page. Modified rules are save addon's local storage.

## Require
jpm

## Debug
```
mkdir ff_profile
jpm run -p ./ff_profile --no-copy --prefs=dev.json --addon-dir=src

```
## Build .xpi
```
jpm xpi --addon-dir=src
```
