'use strict'

const fs = require('fs')
const url = require('url')
const bs = require('browser-sync').create()

// The site to proxy. Suggest using the root domain
const target = 'http://production-site.com'

// A list of literal filenames *without* paths that you wish to proxy
// You need to mirror the filesystem on the server, so:
// - example.css should be located at ./styles/example.css if that's its path on the proxied site
const filesToWatch = [
  'example.css',
]

// By default we're watching all js and css files under the current directory
// If you want to watch everything, use '**', // but it may cause the whole proxied page to refresh
const reloadPatterns = [
  '**/*.css',
  '**/*.js',
]

// This can be a relative or absolute filepath (don't use ~/)
// but the files inside
const localPath = '.'

// Set to true to see each file requested
const debug = false

// By default browser-sync will helpfully open your target site on launch
// set to false if this annoys you
const openOnLaunch = true

// ** note that you need to restart this script after making changes :)

// ============================================================
// No need to edit under here unless you're hacking!
// ============================================================

// Do a sanity check once before launching browser-sync
let regexMashup
try {
  // http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript/3561711#3561711
  // const regexEscaped = filesToWatch.join('|').replace(/[-\/\\^$*+?.()[\]{}]/g, '\\$&')
  regexMashup = new RegExp(filesToWatch.join('|'))
  console.log(`Compiled patterns to proxy: \n  ${regexMashup} \nTest these at https://regex101.com/\n`)
}
catch(e) {
  console.log(`That's not a valid regex! \nPlease check your regexMashup \n\n${e} \n`)
  process.exit(1)
}


function proxyLocalFiles (req, res, next) {
  const pathname = url.parse(req.url).pathname
  // enxure that we're not tripped up by cache busting query strings
  const cleanedPath = pathname.replace(/\?.*/, '')
  if (cleanedPath.match(regexMashup) && !cleanedPath.match(/\.map$/)) {
    const localFileName = localPath + cleanedPath
    try {
      const localFile = fs.readFileSync(localFileName)
      console.log(`> Proxying: ${localFileName}`)
      res.end(localFile.toString())
    }
    catch(e) {
      console.log(`\n!!! Couldn't find the requested local file:\n  ${localFileName} \n  ${e} \nServing the original: \n${req.url} \n`)
      next()
    }
  }
  else {
    if (debug) console.log(req.url)
    next()
  }
}

bs.init({
  notify: true,
  port: 3000,
  open: openOnLaunch,
  watch: reloadPatterns,
  proxy: {
    target: target,
    middleware: proxyLocalFiles,
  },
})

bs.watch(reloadPatterns).on('change', bs.reload)
