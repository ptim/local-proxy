#! /usr/bin/env node
'use strict'

const bs = require('browser-sync').create()
const dedent = require('dedent')
const fg = require('fast-glob')
const fs = require('fs')
const logger = require('eazy-logger').Logger({
  useLevelPrefixes: false,
})
const mime = require('mime/lite')
const path = require('path')
const url = require('url')
const yargs = require('yargs')

const argv = yargs
  .usage('Usage: $0 [options] <url>')
  .options({
    c: {
      alias: 'config-file',
      describe: dedent`
        Path to a JSON config file (.local-proxyrc.json is automatically found).

        You can provide the URL to proxy as "target".

        Options should be provided in camelCase only, eg:

          {"noOpen": true, "target": "example.com"}\n
      `,
      type: 'string',
      default: '.local-proxyrc.json',
    },

    // path is a relative url from the current..
    // imagine that the directory you specify here
    // is where the proxied site's index.html is located,
    // and ensure you create a faithful directory hierarchy for the files you want replaced
    d: {
      alias: 'directory',
      describe: 'Path to the directory where local files are stored',
      type: 'string',
    },

    f: {
      alias: 'files',
      describe: dedent`
        Proxy (and watch) files matching this minimatch pattern.

        Eg:
          **/*.css = any CSS file in any sub directory
          dist/*.(css|js) = CSS or JS files in the dist directory

        See https://github.com/isaacs/minimatch#usage\n
      `,
      nargs: 1,
      type: 'string',
    },

    p: {
      alias: 'prefix',
      describe: dedent`
        The path components between the domain and the file(s) you want to match.

        If your target file is example.com/wp-content/themes/my-theme/styles.css,
        then the prefix is: "wp-content/themes/my-theme".\n
      `,
      nargs: 1,
      type: 'string',
    },

    o: {
      alias: 'open',
      describe: 'Auto-open in the browser',
      type: 'boolean',
      default: undefined,
    },
    n: {
      alias: 'no-open',
      describe: 'Don\'t auto-open in the browser',
      type: 'boolean',
      default: undefined,
    },

    P: {
      alias: 'port',
      describe: 'Port to serve the proxied site on',
      type: 'number',
    },

    v: {
      alias: 'verbose',
      describe: 'Print extra detail in the console (v,vv,vvv)',
      type: 'count', // eg: vvv == 3
    },
  })

  .wrap(100)
  .version()
  .help()
  .example('$0 --prefix wp-content/themes/my-theme example.com')
  .epilog('For more info, see: https://github.com/ptim/local-proxy')

  .showHelpOnFail()
  .argv

const verbose = argv.verbose
const DEBUG  = verbose >= 1
const CHATTY = verbose >= 2
const SPAM   = verbose >= 3

let config = {}
// search for a config file
const configFile = fs.readFileSync(argv.configFile, 'utf-8')
if (configFile) {
  config = JSON.parse(configFile)
  if (CHATTY) logger.info('configFile', JSON.stringify(config, null, '  '))
}

if (CHATTY) logger.info('argv', JSON.stringify(argv, null, '  '))

// If we set defaults via yargs, props in .local-proxyrc.json will be overwritten
const directory = (argv.directory || config.directory || '.' + '/').replace(/\/\/$/, '') // enforce trailing slash
// default to assuming that the current directory is a wordpress theme
const prefix = argv.prefix || config.prefix || `wp-content/themes/${process.cwd().split('/').pop()}`
const files = argv.files || config.files || '**/*.css'
// even a default undefined overwrites the config file
const open = typeof argv.open !== 'undefined' &&  argv.open || config.open || false
const noOpen = typeof argv.noOpen !== 'undefined' &&  argv.noOpen || config.noOpen
const port = argv.port || config.port || 3000
let target = argv._[0] || config.target || ''

if (DEBUG) logger.info(JSON.stringify({
  directory, prefix, files, open, noOpen, port, target,
}, null, '  '))

// only proceed when target matches 'a.a' or localhost
if (!/(localhost|.+\..+)/.test(target)) {
  // throw new Error()
  logger.error('\n{red:Please specify a URL to proxy}\n')
  yargs.showHelp()
  process.exit(1)
}

logger.info('\nTarget: {green:%s}', target)
logger.info('Directory: {green:%s}', directory)
logger.info('Path prefix: {green:%s}', prefix)
logger.info('Files to inject: {green:%s}\n', files)
if (DEBUG) logger.info('\nLog level:', SPAM && 'SPAM' || CHATTY && 'CHATTY' || 'DEBUG')

if (SPAM) logger.log('glob.sync verbose output:')
const globOptions = {
  cwd: directory,
  deep: true,
  onlyFiles: true,
  unique: true, // sounds sensible; race conditions?
  // DS_Store not working
  ignore: [
    'node_modules/**',
    'bower_components/**',
    '.git/**',
    '**/.DS_Store',
  ],
}
const filesToWatch = fg.sync(files, globOptions)
logger.info('{bold:Found }{magenta:%s}{bold: files to serve:}', filesToWatch.length)
logger.info('{green:%s}\n', filesToWatch.map(file => file).join('\n'))

// Do a sanity check once before launching browser-sync
let regexMashup
try {
  regexMashup = new RegExp(filesToWatch.join('|'))
  if (CHATTY) logger.info(
    '{Bold:Compiled patterns to proxy:}\n{grey:%s}\n{lightgrey:Test these at https://regex101.com/}\n',
    regexMashup
  )
}
catch(e) {
  logger.error('That\'s not a valid regex! \nPlease check your regexMashup \n\n{red:%s}\n', e)
  process.exit(1)
}

function proxyLocalFiles (req, res, next) {
  const pathname = url.parse(req.url).pathname
  // ensure that we're not tripped up by cache busting query strings
  const cleanedPath = pathname.replace(/\?.*/, '')

  if (cleanedPath.match(regexMashup) && !cleanedPath.match(/\.map$/)) {
    // strip the prefix out of cleanedPath
    const localFileName = path.join(directory, cleanedPath.replace(prefix, ''))
    try {
      const localFile = fs.readFileSync(localFileName)
      if (DEBUG) logger.info('{lightgrey:%s} {green:%s}', res.statusCode, localFileName)
      res.setHeader('Content-Type', mime.getType(cleanedPath))
      res.writeHead(302)
      res.end(localFile.toString())

      logger.info('{green:%s %s}', res.statusCode, localFileName)
      bs.notify(`Injected: ${localFileName}`)
    }
    catch(e) {
      if (DEBUG) console.error(e)
      // we found a file to serve, but there was an issue serving it
      logger.info('{red:404 %s} {white:%s}', localFileName, '(local-proxy -v for more info)')
      // ...continue with normal broswer-sync response
      next()
    }
  }
  else {
    if (DEBUG) logger.info('{lightgrey:%s} {grey:%s}', res.statusCode, req.url)
    next()
  }
}

const watchPatterns = [
  directory + files,
]
if (CHATTY) console.log('watchPatterns', watchPatterns, '\n')

bs.init({
  notify: true,
  port: port,
  open: noOpen !== null ? false : open, // noOpen wins if set,
  watch: watchPatterns,
  proxy: {
    target,
    middleware: proxyLocalFiles,
  },
})

bs.watch(watchPatterns).on('change', bs.reload)
