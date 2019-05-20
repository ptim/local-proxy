# Local Proxy

A friendly middleware for [browser-sync] to proxy files on a live server to your local filesystem. 

Thanks to browser-sync, it offers file watching and live reloading (with injection wherever possible).

The primary use case for local-proxy has been to assist in the development of WordPress themes on a production site by allowing you to editing local files, and having them injected into the proxied site.  

This side steps the complexities of keeping your local and remote databases and media libraries in sync, and allows you to make hot-reloaded CSS edits which are visible only to you. Mess around with your theme in private, and deploy the renovated theme when it's ready. 


## Installation

It's recommended to install globally so that you can use it across any of your projects:

```bash
npm install -g @ptim/local-proxy
# or
yarn global add @ptim/local-proxy
```

If you prefer to install locally, consider adding an entry to NPM scripts in package.json:

```json
{
    "scripts": {
        "proxy": "local-proxy example.com"
    }
}
```

Then you can `npm run proxy`.


## Execution

The most basic use is:

```bash
cd my-wordpress-theme
local-proxy example.com
```

By default, local-proxy will assume that the current folder is a WordPress theme folder, and will set `prefix` variable accordingly, eg: `wp-content/themes/my-wordpress-theme`. 

See #concept and #options for more info.


## Concept

local-proxy does three main things:

- proxy the target site, so that `example.com` is browsable on your computer as `localhost:3000`
- serve any local files that correspond to remote requests, so if you have a properly placed `style.css`, then it gets served instead of the 'live' version
- watch for changes to specified local files, and inject them into the page without requiring a browser refresh (when possible - there's no hot refresh here, sorry!)

The most basic example configuration might be:

```json
{
    "target": "example.com",
    "prefix": "wp-content/themes/my-theme",
    "files": "style.css"
}
```

Which is interpreted as:

```text
example.com/wp-content/themes/my-theme/style.css
^---------^ ^------------------------^ ^-------^
   target           prefix               files
```

You could proxy both your plugins and themes directory like so:

```json
{
    "target": "example.com",
    "prefix": "wp-content",
    "files": "(themes|plugins)/**"
}
```

This should work nicely if you run local-proxy from inside your local `wp-content` directory. You only need to mirror files that you actually want to override! If there's a problem finding or serving a local file, then the original, remote file will be sent to the browser instead.

Of course, this is really only useful for styling changes, because **your local PHP files will never get executed on the live site!**


## Options

To see the options on the fly:

```bash
local-proxy --help
```

### `-c`, `--config-file`  

Path to a JSON config file (`.local-proxyrc.json` is automatically found).

You can provide the URL to proxy as "target".

Options should be provided in camelCase only, eg:

```json
{ "target": "example.com" }
```

 
### `-d`, `--directory`    

Path to the directory where local files are stored. Defaults to `.` - the current directory.


### `-f`, `--files`

Proxy (and watch) files matching this glob pattern.

Defaults to `**/*.css` - any CSS file below the current directory.

Eg:

- `**` = any file in any subdirectory
- `dist/*.(css|js)` = CSS or JS files in the dist directory

See:

- [Gulp: explaining Globs](https://gulpjs.com/docs/en/getting-started/explaining-globs) 
- [glob-primer](https://github.com/isaacs/node-glob#glob-primer) (we're actually using fast-glob, but this documentation is similar, and succinct)
- [micromatch](https://github.com/micromatch/micromatch#matching-features) which does the pattern matching for fast-glob


### `-p`, `--prefix`       

The path components between the domain and the file(s) you want to match.

If your target file is `example.com/wp-content/themes/my-theme/styles.css`, then the prefix is: `wp-content/themes/my-theme`.

By default, local-proxy will assume that the current folder is a WordPress theme folder, and will set `prefix` variable accordingly, eg: `wp-content/themes/my-wordpress-theme`.


### `-o`, `--open`         

Auto-open in the browser. Defaults to `false`.


### `-n`, `--no-open`      

Don't auto-open in the browser Defaults to `true`.


### `-P`, `--port`         

Port to serve the proxied site on. Defaults to `3000`.                                      


### `-v`, `--verbose`      

Print extra detail in the console. Pass `-v`, `-vv`, or `-vvv`.                            


### `--version`          

Show version number                                                   


### `--help`             

Show help                                                             


## Todos

- tests!
- add a command to mirror all the files loaded by the target site
- port across to a webpack configuration

[browser-sync]: https://www.browsersync.io/
