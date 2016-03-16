# Local Proxy

A friendly middleware for [browser-sync] to proxy files on a live server to your local filesystem. 

Thanks to browser-sync, it offers file watching and live reloading with (injection wherever possible).


## Install:

    npm install


## Configure: 

There are only two settings you need to configure in `index.js`:

### The site to proxy

```
const target = 'http://production-site.com'
```

### A list of literal filenames 

... *without* paths that you wish to proxy.

You need to mirror the filesystem on the server, so:

example.css should be located at ./styles/example.css if that's its path on the proxied site

```
const filesToWatch = [
    'example.css',
]
```


## Run

    npm start

[browser-sync]: https://www.browsersync.io/
