#! /usr/bin/env node
'use strict'

const glob = require('glob')
const fs = require('fs')
const url = require('url')
const bs = require('browser-sync').create()
const logger = require('eazy-logger').Logger({
  useLevelPrefixes: false,
})

const yargs = require('yargs')
const argv = yargs
  .usage('Usage: $0 [options] <url>')
  .options({
    c: {
      alias: 'css',
      describe: 'Proxy all CSS files requested',
      type: 'boolean',
    },
    j: {
      alias: 'js',
      describe: 'Proxy all JS files requested',
      type: 'boolean',
    },
    // pattern is in the https://github.com/isaacs/minimatch format
    // you only need to change this if you want to restrict the files you'll include.
    // By default we're watching all files under the current directory
    // you can restrict this using a glob as above

    p: {
      alias: ['g','pattern', 'glob'],
      describe: 'Proxy files matching this pattern (minimatch glob)',
      nargs: 1,
      type: 'string',
      default: '**',
    },
    // By default browser-sync will helpfully open your target site on launch
    // set to false if this annoys you
    o: {
      alias: 'open',
      describe: 'Auto-open in the browser',
      type: 'boolean',
      default: true,
    },
    // Set to true to see each file requested
    v: {
      alias: 'verbose',
      describe: 'Print extra detail in the console',
      type: 'boolean',
      // type: 'count', // eg: vvv == 3
    },
    // path is a relative url from the current..
    // imagine that the directory you specify here
    // is where the proxied site's index.html is located,
    // and ensure you create a faithful directory hierarchy for the files you want replaced
    d: {
      alias: ['directory', 'localPath'],
      describe: 'Path to the directory where local files will be stored',
      type: 'string',
      default: 'local-files/',
      // type: 'count', // eg: vvv == 3
    },

    // Additional options to consider:
    // - blacklist (eg php?)

    // s: {
    //   alias: 'sourceMappingPattern',
    //   describe: 'Add `//# sourceMappingURL` to the file matching this pattern (glob)',
    //   nargs: 1,
    //   implies: 'm',
    //   type: 'string',
    //   requiresArg: true,
    //   // group: 'Source maps'
    // },
    // x: {
    //   alias: 'sourceMapSuffix',
    //   describe: 'Specify the suffix to append to the file found at sourceMappingPattern',
    //   nargs: 1,
    //   implies: 's',
    //   type: 'string',
    //   // demand: (yargs) => yargs.options.sourceMappingPattern
    //   requiresArg: true,
    //   // group: 'Source maps'
    // },
    // m: {
    //   alias: 'sourceMappingURL',
    //   describe: 'Specify the sourceMappingURL to use for sourceMappingPattern',
    //   nargs: 1,
    //   implies: 's',
    //   type: 'string',
    //   // demand: (yargs) => yargs.options.sourceMappingPattern
    //   requiresArg: true,
    //   // group: 'Source maps'
    // },
  })

  .wrap(100)
  .version()
  .help()
  .example('$0 --css example.com')
  // .example('$0 start -s \'my-file.js\' -x \'map\' example.com')
  // .example('$0 start --css -s \'my-file.js\' -x \'map\' example.com')
  .epilog('For more info, see: https://github.com/ptim/local-proxy')

  .check(argv => {
    if (!/.+\..+/.test(argv._[0])) throw new Error('Please specify a URL to proxy')
  })
  .showHelpOnFail()
  .argv

console.log('argv', argv)

const {
  _: [
    // The site to proxy. I suggest using the root domain,
    // but if you're repeatedly opening the same file, you might change it to a deep link
    target,
  ],
  css,
  js,
  pattern,
  localPath,
  open,
  verbose,
} = argv

// TODO: make this honor the options, eg --css, etc
const watchPatterns = [
  localPath + '**',
]

if (verbose) console.log(`Searching for: ${pattern}\n`)

const options = {
  cwd: localPath,
  nodir: true,
  ignore: '{node_modules/**,.git/**}',
}
const filesToWatch = glob.sync(pattern, options)

logger.info('{bold:Found }{magenta:%s}{bold: files to serve:}', filesToWatch.length)
logger.info('{grey:-------------------------------------}')
filesToWatch.forEach(file => { logger.info('{green:%s}', file) })
logger.info('{grey:-------------------------------------}\n')

// Do a sanity check once before launching browser-sync
let regexMashup
try {
  regexMashup = new RegExp(filesToWatch.join('|'))
  if (verbose) console.log(`Compiled patterns to proxy: \n  ${regexMashup} \nTest these at https://regex101.com/\n`)
}
catch(e) {
  console.error(`That's not a valid regex! \nPlease check your regexMashup \n\n${e} \n`)
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
      if (verbose) console.log(`> Proxying: ${localFileName}`)
      res.end(localFile.toString())
    }
    catch(e) {
      // TODO: copy the file here
      if (verbose) console.log(`\n!!! Couldn't find the requested local file:\n  ${localFileName} \n  ${e} \nServing the original: \n${req.url} \n`)
      next()
    }
  }
  else {
    if (verbose) console.log(req.url)
    next()
  }
}

bs.init({
  notify: true,
  port: 3000,
  open,
  watch: watchPatterns,
  proxy: {
    target,
    middleware: proxyLocalFiles,
  },
})

bs.watch(watchPatterns).on('change', bs.reload)
