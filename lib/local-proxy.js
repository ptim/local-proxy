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
const mm = require('micromatch')
const path = require('path')
const url = require('url')
const yargs = require('yargs')

const protocolExample = dedent`
  ✅ https://example.com => https://localhost
  ✅ http://example.com => http://localhost
  ❌ https://example.com => http://localhost
  ❌ http://example.com => https://localhost
`

const argv = yargs
  .usage(dedent`
    Usage: $0 [options] <url>

    Recommend setting a protocol for your URL.
    Ensure that the protocol is correct!
    ${protocolExample}
  `)
  .options({
    c: {
      alias: 'config-file',
      describe: dedent`
        Path to a JSON config file (.local-proxyrc.json is automatically found).

        Provide the URL to proxy as "target".

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
        Proxy (and watch) files matching this minimatch pattern. Default: **/*.css

        Eg:
          **/*.css = any CSS file in any sub directory
          dist/*.(css|js) = CSS or JS files in the dist directory

        See https://github.com/micromatch/micromatch#matching-features\n
      `,
      nargs: 1,
      type: 'string',
    },

    p: {
      alias: 'prefix',
      describe: dedent`
        The path components between the domain and the file(s) you want to match.

        If your target file is example.com/wp-content/themes/my-theme/styles.css,
        then the prefix is: "wp-content/themes/my-theme".

        Because the primary usecase for local-proxy is to support wordpress development,
        --prefix defaults to the inferred value: given we're in a directory called 'my-theme',
        then prefix will default to 'wp-content/themes/my-theme'.

        To set this to an empty string, you need to quote the entire option, and use an "=" like:
        local-proxy '--prefix=""' https://example.com
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
  .example(`$0 --prefix wp-content/themes/my-theme https://example.com`)
  .example(`$0 '--prefix=""' https://example.com`)
  .epilog('For more info, see: https://github.com/ptim/local-proxy')

  .showHelpOnFail()
  .argv

const verbose = argv.verbose
const DEBUG  = verbose >= 1
const CHATTY = verbose >= 2
const SPAM   = verbose >= 3
const logLevel = SPAM ? 'SPAM' : CHATTY ? 'CHATTY' : DEBUG ? 'DEBUG': null

let config = {}
// search for a config file
try {
  const configFile = fs.readFileSync(argv.configFile, 'utf-8')
  config = JSON.parse(configFile)
  if (CHATTY) logger.info('configFile', JSON.stringify(config, null, '  '))
}
catch (e) {
  // .local-proxyrc.json doesn't exist
  if (CHATTY) logger.info('configFile %s not found', argv.configFile)
}

if (CHATTY) logger.info('argv', JSON.stringify(argv, null, '  '))

// If we set defaults via yargs, props in .local-proxyrc.json will be overwritten
const directory = (argv.directory || config.directory || '.' + '/').replace(/\/\/$/, '') // enforce trailing slash

const isPrefixSet = argv.prefix || config.prefix
const baseDir = process.cwd().split('/').pop()
let prefix = `wp-content/themes/${baseDir}`
if (isPrefixSet) prefix = argv.prefix || config.prefix

const files = argv.files || config.files || '**/*.(css|css.map)'
// even a default undefined overwrites the config file
const open = typeof argv.open !== 'undefined' &&  argv.open || config.open || false
const noOpen = typeof argv.noOpen !== 'undefined' &&  argv.noOpen || config.noOpen
const port = argv.port || config.port || 3000
let target = argv._[0] || config.target || ''

// only proceed when target matches 'a.a' or localhost
if (!/(localhost|.+\..+)/.test(target)) {
  logger.error('\n{red:Please specify a URL to proxy}\n')
  yargs.showHelp()
  process.exit(1)
}

let isProtocolInferred

if (!/^http/.test(target)) {
  isProtocolInferred = true
  target = `http://${target}`

  // FIXME: not logging under -v
  if (DEBUG) logger.warn(
    '\n{red:%s}',
    dedent`
      Warning! Protocol for <url> was not set - HTTP will be assumed.

      Note that in the case of a mis-match, the proxied site won't resolve!

      ${protocolExample}
    `
  )
}

const protocol = target.match(/^(https?).*/)[1].toLowerCase()
logger.info(
  '\n{yellow:%s} {magenta:%s}',
  `${protocol.toUpperCase()} protocol was ${isProtocolInferred ? 'inferred' : 'set'} - ensure you develop on:`,
  `${protocol}://localhost:${port}`
)

if (argv.wordpress) logger.info(
  '{green:%s}',
  `\nFound --wordpress option, using the setting the prefix : WordPress theme; Set --prefix="" if this is not what you intended.`
)

logger.info('\nTarget: {green:%s}', target)
logger.info('Directory: {green:%s}', directory)
logger.info('Path prefix: {green:%s}', prefix)
logger.info('Files to inject: {green:%s}', files)
if (DEBUG) logger.info(`Verbosity: {green:%s}`, `${verbose} (${logLevel})`)
logger.info('') // spacing

const ignorePatterns = [
  'node_modules/**',
  'bower_components/**',
  '.git/**',
  '**/.DS_Store',
]

if (SPAM) logger.log('glob.sync verbose output:')
const globOptions = {
  cwd: directory,
  deep: true,
  onlyFiles: true,
  unique: true, // sounds sensible; race conditions?
  ignore: ignorePatterns,
}
const filesToWatch = fg.sync(files, globOptions)
logger.info('{bold:Found }{cyan:%s}{bold: files to serve:}', filesToWatch.length)
logger.info('{green:%s}\n', filesToWatch.map(file => file).join('\n'))

// Do a sanity check once before launching browser-sync
let regexMashup
try {
  regexMashup = mm.makeRe(`/${prefix}/${files}`, {
    ignore: ignorePatterns,
  })
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

  if (cleanedPath.match(regexMashup)) {
    // strip the prefix out of cleanedPath
    const localFileName = path.join(directory, cleanedPath.replace(prefix, ''))
    if (CHATTY) logger.info('Match: %s', cleanedPath)

    try {
      const localFile = fs.readFileSync(localFileName)
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
  directory + files
    .replace('map', '') // watching map files will force page reload
    .replace(/s[ac]ss/, '') // watching SCSS will force page reload
    .replace(/\|\|/g, '|'), // replace any resulting double pipes
]
if (CHATTY) console.log('watchPatterns', watchPatterns, '\n')

bs.init({
  notify: true,
  port: port,
  open: noOpen !== null ? false : open, // noOpen wins if set,
  watch: watchPatterns,
  /*
  Note - [option: https] is not needed for proxy option as it will be inferred from your target url.
  https://browsersync.io/docs/options#option-https
  */
  proxy: {
    target,
    middleware: proxyLocalFiles,
  },
})

bs.watch(watchPatterns).on('change', bs.reload)
