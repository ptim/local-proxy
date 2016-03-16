'use strict'

const glob = require('glob')
const fs = require('fs')
const url = require('url')
const bs = require('browser-sync').create()

// Set to true to see each file requested
const debug = false

// The site to proxy. I suggest using the root domain,
// but if you're repeatedly opening the same file, you might change it to a deep link
const targetSite = 'http://example.com.au'

// path is a relative url from the current..
// imagine that the directory you specify here
// is where the proxied site's index.html is located,
// and ensure you create a faithful directory hierarchy for the files you want replaced
const localPath = 'local-files/'

// filePattern is in the https://github.com/isaacs/minimatch format
// you only need to change this if you want to restrict the files you'll include
const filePattern = '**'

// By default we're watching all files under the current directory
// you can restrict this using a glob as above
const watchPatterns = [
  localPath + '**',
]

// By default browser-sync will helpfully open your target site on launch
// set to false if this annoys you
const openOnLaunch = true

// ** note that you need to restart this script after making changes :)

// ============================================================
// No need to edit under here unless you're hacking!
// ============================================================

if (debug) console.log(`Searching for: ${filePattern}\n`)

const options = {
  cwd: localPath,
  nodir: true,
  ignore: '{node_modules/**,.git/**}',
}
const filesToWatch = glob.sync(filePattern, options)

console.log(`Found ${filesToWatch.length} files to serve:`)
console.log(`-------------------------------------`)
filesToWatch.forEach(file => { console.log(file) })
console.log(`-------------------------------------\n`)

// Do a sanity check once before launching browser-sync
let regexMashup
try {
  regexMashup = new RegExp(filesToWatch.join('|'))
  if (debug) console.log(`Compiled patterns to proxy: \n  ${regexMashup} \nTest these at https://regex101.com/\n`)
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
      if (debug) console.log(`> Proxying: ${localFileName}`)
      res.end(localFile.toString())
    }
    catch(e) {
      if (debug) console.log(`\n!!! Couldn't find the requested local file:\n  ${localFileName} \n  ${e} \nServing the original: \n${req.url} \n`)
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
  watch: watchPatterns,
  proxy: {
    target: targetSite,
    middleware: proxyLocalFiles,
  },
})

bs.watch(watchPatterns).on('change', bs.reload)
