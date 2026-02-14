/**
 * Command Handlers
 */

import type { CommandHandler } from '../types.js'

import { catCommand } from './cat.js'
import { echoCommand } from './echo.js'
import { lsCommand } from './ls.js'
import { rmCommand } from './rm.js'
import { mkdirCommand } from './mkdir.js'
import { grepCommand } from './grep.js'
import { findCommand } from './find.js'
import { curlCommand } from './curl.js'
import { headCommand } from './head.js'
import { tailCommand } from './tail.js'
import { jqCommand } from './jq.js'
import { browseCommand } from './browse.js'
import { envCommand } from './env.js'
import { sortCommand } from './sort.js'
import { wcCommand } from './wc.js'
import { fileCommand } from './file.js'

export const commands: CommandHandler[] = [
  catCommand,
  echoCommand,
  lsCommand,
  rmCommand,
  mkdirCommand,
  grepCommand,
  findCommand,
  curlCommand,
  headCommand,
  tailCommand,
  jqCommand,
  browseCommand,
  envCommand,
  sortCommand,
  wcCommand,
  fileCommand
]

export {
  catCommand,
  echoCommand,
  lsCommand,
  rmCommand,
  mkdirCommand,
  grepCommand,
  findCommand,
  curlCommand,
  headCommand,
  tailCommand,
  jqCommand,
  browseCommand,
  envCommand,
  sortCommand,
  wcCommand,
  fileCommand
}
