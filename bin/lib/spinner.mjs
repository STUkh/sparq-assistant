// bin/lib/spinner.mjs — Progress spinner

import { styleText } from 'node:util'
import { getVerbosity, isDryRun, useColor } from './state.mjs'

const FRAMES = useColor
  ? [
      '\u280B',
      '\u2819',
      '\u2839',
      '\u2838',
      '\u283C',
      '\u2834',
      '\u2826',
      '\u2827',
      '\u2807',
      '\u280F',
    ]
  : ['|', '/', '-', '\\']
const INTERVAL = 80

/**
 * Create a spinner for indicating progress during long operations.
 * Falls back to simple console.log in quiet/dry-run/non-TTY mode.
 */
export function createSpinner(message) {
  if (getVerbosity() === 'quiet' || isDryRun() || !useColor) {
    return {
      start() {},
      update(msg) {
        message = msg
      },
      succeed(msg) {
        console.log(`  ${msg || message}`)
      },
      fail(msg) {
        console.log(`  ${msg || message}`)
      },
      stop() {},
    }
  }

  let frame = 0
  let timer = null
  let currentMsg = message

  return {
    start() {
      process.stdout.write(`  ${FRAMES[0]} ${currentMsg}`)
      timer = setInterval(() => {
        frame = (frame + 1) % FRAMES.length
        process.stdout.write(`\r  ${FRAMES[frame]} ${currentMsg}`)
      }, INTERVAL)
      timer.unref()
    },
    update(msg) {
      currentMsg = msg
    },
    succeed(msg) {
      clearInterval(timer)
      process.stdout.write(`\r  ${styleText('green', '\u2713')} ${msg || currentMsg}\n`)
    },
    fail(msg) {
      clearInterval(timer)
      process.stdout.write(`\r  ${styleText('red', '\u2717')} ${msg || currentMsg}\n`)
    },
    stop() {
      clearInterval(timer)
      process.stdout.write(`\r${' '.repeat((currentMsg?.length ?? 0) + 4)}\r`)
    },
  }
}
