/**
 * date - Display date and time
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

/** Map strftime-style format specifiers to date parts */
function formatDate(format: string, date: Date, utc: boolean): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')

  const y = utc ? date.getUTCFullYear() : date.getFullYear()
  const m = utc ? date.getUTCMonth() : date.getMonth()
  const d = utc ? date.getUTCDate() : date.getDate()
  const H = utc ? date.getUTCHours() : date.getHours()
  const M = utc ? date.getUTCMinutes() : date.getMinutes()
  const S = utc ? date.getUTCSeconds() : date.getSeconds()
  const dow = utc ? date.getUTCDay() : date.getDay()

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const specifiers: Record<string, string> = {
    'Y': String(y),
    'y': pad(y % 100),
    'm': pad(m + 1),
    'd': pad(d),
    'e': String(d).padStart(2, ' '),
    'H': pad(H),
    'M': pad(M),
    'S': pad(S),
    'I': pad(H % 12 || 12),
    'p': H < 12 ? 'AM' : 'PM',
    'P': H < 12 ? 'am' : 'pm',
    'A': dayNames[dow],
    'a': dayAbbr[dow],
    'B': monthNames[m],
    'b': monthAbbr[m],
    'h': monthAbbr[m],
    'u': String(dow === 0 ? 7 : dow),
    'w': String(dow),
    'j': pad(dayOfYear(y, m, d), 3),
    'Z': utc ? 'UTC' : Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value || '',
    'z': utc ? '+0000' : formatTzOffset(date),
    's': String(Math.floor(date.getTime() / 1000)),
    'n': '\n',
    't': '\t',
    '%': '%',
    // Compound specifiers
    'F': `${String(y)}-${pad(m + 1)}-${pad(d)}`,
    'T': `${pad(H)}:${pad(M)}:${pad(S)}`,
    'R': `${pad(H)}:${pad(M)}`,
    'D': `${pad(m + 1)}/${pad(d)}/${pad(y % 100)}`,
    'r': `${pad(H % 12 || 12)}:${pad(M)}:${pad(S)} ${H < 12 ? 'AM' : 'PM'}`,
    'c': `${dayAbbr[dow]} ${monthAbbr[m]} ${String(d).padStart(2, ' ')} ${pad(H)}:${pad(M)}:${pad(S)} ${String(y)}`,
  }

  let result = ''
  let i = 0
  while (i < format.length) {
    if (format[i] === '%' && i + 1 < format.length) {
      const spec = format[i + 1]
      result += specifiers[spec] ?? `%${spec}`
      i += 2
    } else {
      result += format[i]
      i++
    }
  }

  return result
}

function dayOfYear(year: number, month: number, day: number): number {
  const start = new Date(year, 0, 1)
  const current = new Date(year, month, day)
  return Math.floor((current.getTime() - start.getTime()) / 86400000) + 1
}

function formatTzOffset(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const absOffset = Math.abs(offset)
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0')
  const minutes = String(absOffset % 60).padStart(2, '0')
  return `${sign}${hours}${minutes}`
}

export const dateCommand: CommandHandler = {
  name: 'date',

  help: {
    usage: 'date [OPTIONS] [+FORMAT]',
    description: 'Display date and time',
    flags: [
      { flag: '-u', description: 'Display UTC time' },
      { flag: '-d DATE', description: 'Display specified date instead of current time' },
      { flag: '-I', description: 'Output in ISO 8601 format (same as +%Y-%m-%dT%H:%M:%S%z)' },
    ],
    examples: [
      { command: 'date', description: 'Show current date and time' },
      { command: 'date +%Y-%m-%d', description: 'Show date in YYYY-MM-DD format' },
      { command: 'date +%Y%m%d', description: 'Show date as YYYYMMDD' },
      { command: 'date -u', description: 'Show current UTC date and time' },
      { command: "date -d '2024-01-15'", description: 'Show a specific date' },
      { command: 'date +%s', description: 'Show Unix timestamp' },
    ]
  },

  async execute(args: string[], _ctx: CommandContext): Promise<ShellResult> {
    let utc = false
    let iso = false
    let dateStr: string | null = null
    let format: string | null = null

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === '-u' || arg === '--utc') {
        utc = true
      } else if (arg === '-I' || arg === '--iso-8601') {
        iso = true
      } else if (arg === '-d' || arg === '--date') {
        dateStr = args[++i]
        if (dateStr === undefined) {
          return { exitCode: 1, stdout: '', stderr: 'date: option requires an argument -- d\n' }
        }
      } else if (arg.startsWith('+')) {
        format = arg.slice(1)
      } else {
        return { exitCode: 1, stdout: '', stderr: `date: invalid option -- '${arg}'\n` }
      }
    }

    // Resolve the date
    let date: Date
    if (dateStr) {
      date = new Date(dateStr)
      if (isNaN(date.getTime())) {
        return { exitCode: 1, stdout: '', stderr: `date: invalid date '${dateStr}'\n` }
      }
    } else {
      date = new Date()
    }

    // Determine format
    let output: string
    if (iso) {
      output = formatDate('%Y-%m-%dT%H:%M:%S%z', date, utc)
    } else if (format !== null) {
      output = formatDate(format, date, utc)
    } else {
      // Default format: "Tue Feb 17 14:30:00 UTC 2026"
      output = formatDate('%a %b %e %H:%M:%S %Z %Y', date, utc)
    }

    return { exitCode: 0, stdout: output + '\n', stderr: '' }
  }
}
