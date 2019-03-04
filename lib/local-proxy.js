#! /usr/bin/env node
'use strict'

const glob = require('glob')
const path = require('path')
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
    // path is a relative url from the current..
    // imagine that the directory you specify here
    // is where the proxied site's index.html is located,
    // and ensure you create a faithful directory hierarchy for the files you want replaced
    d: {
      alias: 'directory',
      describe: 'Path to the directory where local files will be stored',
      type: 'string',
      default: '.',
    },

    // pattern is in the https://github.com/isaacs/minimatch format
    // you only need to change this if you want to restrict the files you'll include.
    // By default we're watching all files under the current directory
    // you can restrict this using a glob as above
    f: {
      alias: 'files',
      describe: 'Proxy files matching this minimatch pattern',
      nargs: 1,
      type: 'string',
      default: '**',
    },

    p: {
      alias: 'prefix',
      // if your target file is example.com/wp-content/themes/my-theme/styles.css,
      // then the prefix is: `wp-content/themes/my-theme`
      describe: 'The path components between the domain and the file(s) you want to match',
      nargs: 1,
      type: 'string',
      default: 'wp-content/themes', // works if you're one level up from your theme directory
    },
    // By default browser-sync will helpfully open your target site on launch
    // set to false if this annoys you
    o: {
      alias: 'open',
      describe: 'Auto-open in the browser',
      type: 'boolean',
      default: false,
    },
    n: {
      alias: 'no-open',
      describe: 'Don\'t auto-open in the browser',
      type: 'boolean',
      default: false,
    },

    P: {
      alias: 'port',
      describe: 'Port to serve the proxied site on',
      type: 'string',
      default: '3000',
    },

    // Set to true to see each file requested
    v: {
      alias: 'verbose',
      describe: 'Print extra detail in the console',
      type: 'count', // eg: vvv == 3
    },
  })

  .wrap(100)
  .version()
  .help()
  .example('$0 --prefix wp-content/themes/my-theme example.com')
  .epilog('For more info, see: https://github.com/ptim/local-proxy')

  .check(argv => {
    if (argv.verbose) console.log(argv)
    if (!/.+\..+/.test(argv._[0])) throw new Error('Please specify a URL to proxy')
    return true
  })
  .showHelpOnFail()
  .argv


let {
  _: [
    // The site to proxy. I suggest using the root domain,
    // but if you're repeatedly opening the same file, you might change it to a deep link
    target,
  ],
  directory,
  files,
  prefix,
  open,
  'no-open': noOpen,
  port,
  verbose,
} = argv

const DEBUG  = verbose >= 1
const CHATTY = verbose >= 2
const SPAM   = verbose >= 3

if (DEBUG) logger.log('\nLog level:', SPAM && 'SPAM' || CHATTY && 'CHATTY' || 'DEBUG')
logger.info(`\nSearching for: ${files}\n`)

// enforce a single trailing slash
directory = (directory + '/').replace(/\/\/$/, '')

if (DEBUG) logger.log('glob.sync verbose output:')
const options = {
  cwd: directory,
  nodir: true,
  // DS_Store not working
  ignore: '{node_modules/**,.git/**,[**/,].DS_Store}',
  debug: DEBUG,
}
const filesToWatch = glob.sync(files, options)

logger.info('{bold:Found }{magenta:%s}{bold: files to serve:}', filesToWatch.length)
logger.info('{grey:-------------------------------------}')
filesToWatch.forEach(file => { logger.info('{green:%s}', file) })
logger.info('{grey:-------------------------------------}\n')

// Do a sanity check once before launching browser-sync
let regexMashup
try {
  regexMashup = new RegExp(filesToWatch.join('|'))
  if (DEBUG) logger.info(`Compiled patterns to proxy: ${regexMashup}\nTest these at https://regex101.com/\n`)
}
catch(e) {
  logger.error('That\'s not a valid regex! \nPlease check your regexMashup \n\n{red:%s}\n', e)
  process.exit(1)
}


function proxyLocalFiles (req, res, next) {
  const pathname = url.parse(req.url).pathname
  // ensure that we're not tripped up by cache busting query strings
  const cleanedPath = pathname.replace(/\?.*/, '')
  console.log('pathname', pathname, cleanedPath)

  if (cleanedPath.match(regexMashup) && !cleanedPath.match(/\.map$/)) {
    const localFileName = path.join(directory, cleanedPath)
    try {
      const localFile = fs.readFileSync(localFileName)
      if (DEBUG) logger.info('{lightgrey:%s} {green:%s}', res.statusCode, localFileName)
      res.end(localFile.toString())
    }
    catch(e) {
      if (SPAM) logger.info('{red:%s} {blue:%s}', `404: ${localFileName}`, 'Serving the original')
      next()
    }
  }
  else {
    if (DEBUG) logger.info('{lightgrey:%s} {grey:%s}', res.statusCode, req.url)
    next()
  }
}

// TODO: make this honor the options, eg --css, etc
const watchPatterns = [
  directory + files,
]
if (CHATTY) console.log('watchPatterns', watchPatterns, '\n')

bs.init({
  notify: true,
  port: port,
  open: !noOpen || open, // open wins if both are specified!
  watch: watchPatterns,
  proxy: {
    target,
    middleware: proxyLocalFiles,
  },
})

bs.watch(watchPatterns).on('change', bs.reload)