# Local Proxy

A friendly middleware for [browser-sync] to proxy files on a live server to your local filesystem. 

Thanks to browser-sync, it offers file watching and live reloading with (injection wherever possible).


## Install:

    npm install


## Configure: 

In many cases, the only setting you'll need to change is: 

```
const targetSite = 'http://example.com'
```

Then copy files you want to replace into `local-files`.

You need to mimic the file layout on the target site precisely, eg:

```
.
└── local-files
    ├── index.html # probably not!
    ├── styles
    │   ├── main.css
    │   └── other.css
    └── scripts
        ├── index.js
        └── other.js
```

Note that you *could* proxy index.html, but it wouldn't make much sense for a dynamic site. Maybe useful if you want to 'replay' the DOM representation of a dynamic page.


## Run

    npm start

[browser-sync]: https://www.browsersync.io/
