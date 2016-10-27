/* eslint import/newline-after-import:0, global-require:0 */
import {resolve} from 'path'
import colors from 'colors/safe'
import {spy} from 'sinon'
import {getScriptsAndArgs, help, preloadModule, loadConfig} from './index'

test('getScriptsAndArgs: gets scripts', () => {
  const {scripts} = getScriptsAndArgs({
    args: ['boo'],
    rawArgs: ['node', 'p-s', 'boo'],
  })
  expect(scripts).toEqual(['boo'])
})

test('getScriptsAndArgs: gets scripts in series', () => {
  const {scripts, args} = getScriptsAndArgs({
    args: ['boo,bar'],
    rawArgs: ['node', 'p-s', 'boo,bar'],
  })
  expect(scripts).toEqual(['boo', 'bar'])
  expect(args).toEqual('')
})

test('getScriptsAndArgs: gets parallel scripts', () => {
  const {scripts} = getScriptsAndArgs({
    parallel: 'boo,baz',
    rawArgs: ['node', 'p-s', '-p', 'boo,baz'],
  })
  expect(scripts).toEqual(['boo', 'baz'])
})

test('getScriptsAndArgs: passes args to scripts', () => {
  const {args, scripts} = getScriptsAndArgs({
    args: ['boo'],
    rawArgs: ['node', 'p-s', 'boo', '--watch', '--verbose'],
  })
  expect(scripts).toEqual(['boo'])
  expect(args).toBe('--watch --verbose')
})

test('getScriptsAndArgs: returns empty scripts and args if not parallel and no args', () => {
  const {args, scripts} = getScriptsAndArgs({
    args: [],
    rawArgs: ['node', 'p-s'],
  })
  expect(scripts.length).toBe(0)
  expect(args).toBe('')
})

test('preloadModule: resolves a relative path', () => {
  // this is relative to process.cwd() I think...
  // Because of some fancy stuff that Jest does with requires...
  const relativePath = './src/bin-utils/fixtures/my-module'
  const val = preloadModule(relativePath)
  expect(val).toBe('hello')
})

test('preloadModule: resolves an absolute path', () => {
  const relativePath = './fixtures/my-module'
  const absolutePath = resolve(__dirname, relativePath)
  const val = preloadModule(absolutePath)
  expect(val).toBe('hello')
})

test('preloadModule: resolves a node_module', () => {
  const val = preloadModule('colors/safe')
  expect(val).toBe(colors)
})

test('preloadModule: logs a warning when the module cannot be required', () => {
  const mockWarn = spy()
  jest.resetModules()
  jest.mock('../get-logger', () => () => ({warn: mockWarn}))
  const {preloadModule: proxiedPreloadModule} = require('./index')
  const val = proxiedPreloadModule('./module-that-does-exist')
  expect(val).toBeUndefined()
  expect(mockWarn.calledOnce)
  const [{message}] = mockWarn.firstCall.args
  expect(message).toMatch(/Unable to preload "\.\/module-that-does-exist"/)
})

test('loadConfig: logs a warning when the JS module cannot be required', () => {
  const mockError = spy()
  jest.resetModules()
  jest.mock('../get-logger', () => () => ({error: mockError}))
  const {loadConfig: proxiedReloadConfig} = require('./index')
  const val = proxiedReloadConfig('./config-that-does-exist')
  expect(val).toBeUndefined()
  expect(mockError.calledOnce)
  const [{message}] = mockError.firstCall.args
  expect(message).toMatch(/Unable to find JS config at "\.\/config-that-does-exist"/)
})

test('loadConfig: does not swallow JS syntax errors', () => {
  const originalCwd = process.cwd
  process.cwd = jest.fn(() => resolve(__dirname, '../..'))
  const relativePath = './src/bin-utils/fixtures/syntax-error-module'
  expect(() => loadConfig(relativePath)).toThrowError()
  process.cwd = originalCwd
})

test('loadConfig: can load ES6 module', () => {
  const relativePath = './src/bin-utils/fixtures/fake-es6-module'
  const val = loadConfig(relativePath)
  expect(val).toEqual({
    scripts: {
      skywalker: `echo "That's impossible!!"`,
    },
    options: {},
  })
})

test('loadConfig: does not swallow YAML syntax errors', () => {
  const originalCwd = process.cwd
  process.cwd = jest.fn(() => resolve(__dirname, '../..'))
  const relativePath = './src/bin-utils/fixtures/syntax-error-config.yml'
  expect(() => loadConfig(relativePath)).toThrowError()
  process.cwd = originalCwd
})

test('loadConfig: logs a warning when the YAML file cannot be located', () => {
  const mockError = spy()
  jest.resetModules()
  jest.mock('../get-logger', () => () => ({error: mockError}))
  const {loadConfig: proxiedReloadConfig} = require('./index')
  const val = proxiedReloadConfig('./config-that-does-not-exist.yml')
  expect(val).toBeUndefined()
  expect(mockError.calledOnce)
  const [{message}] = mockError.firstCall.args
  expect(message).toMatch(/Unable to find YML config at "\.\/config-that-does-not-exist.yml"/)
})

test('loadConfig: can load config from YML file', () => {
  const relativePath = './src/bin-utils/fixtures/fake-config.yml'
  const val = loadConfig(relativePath)
  expect(val).toEqual({
    scripts: {
      skywalker: `echo "That's impossible!!"`,
    },
    options: {},
  })
})

test('help: formats a nice message', () => {
  const config = {
    scripts: {
      foo: {
        description: 'the foo script',
        script: 'echo "foo"',
      },
      bar: {
        default: {
          description: 'stuff',
          script: 'echo "bar default"',
        },
        baz: 'echo "baz"',
        barBub: {
          script: 'echo "barBub"',
        },
      },
      build: {
        default: 'webpack',
        x: {
          default: {
            script: 'webpack --env.x',
            description: 'webpack with x env',
          },
          y: {
            description: 'build X-Y',
            script: 'echo "build x-y"',
          },
        },
      },
      foobar: 'echo "foobar"',
      extra: 42,
    },
  }

  const message = help(config)
  // normally I'd use snapshot testing
  // but the colors here are easier to think about
  // than `[32mfoobar[39m` sooo....
  const expected = `
Available scripts (camel or kebab case accepted)
├─ ${colors.green('foo')} - ${colors.white('the foo script')} - ${colors.gray('echo "foo"')}
├─ ${colors.green('bar')} - ${colors.white('stuff')} - ${colors.gray('echo "bar default"')}
│  ├─ ${colors.green('bar.baz')} - ${colors.gray('echo "baz"')}
│  └─ ${colors.green('bar.barBub')} - ${colors.gray('echo "barBub"')}
├─ ${colors.green('build')} - ${colors.gray('webpack')}
│  └─ ${colors.green('build.x')} - ${colors.white('webpack with x env')} - ${colors.gray('webpack --env.x')}
│     └─ ${colors.green('build.x.y')} - ${colors.white('build X-Y')} - ${colors.gray('echo "build x-y"')}
└─ ${colors.green('foobar')} - ${colors.gray('echo "foobar"')}
`.trim()

  expect(message).toBe(expected)
})

test('help: returns no scripts available', () => {
  const config = {scripts: {}}
  const message = help(config)
  const expected = colors.yellow('There are no scripts available')
  expect(message).toBe(expected)
})
