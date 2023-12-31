const TASKS_DB_PATH = `${process.env.HOME}/.journal/trakr.json`

const l = console.log

const PrintIntl = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  minute: 'numeric'
})

const time = {
  string(d: Date): string {
    return PrintIntl.format(d)
  },

  duration(millis: number): string {
    const mins = millis / (1000 * 60)

    if (mins < 60) {
      return `${Math.ceil(mins)}m`
    } else {
      const hours = Math.ceil(mins / 60)
      const rem = Math.ceil(mins % 60)
      return `${hours}h ${rem}m`
    }
  }
}

function printUsage() {
  l('USAGE: trakr <command> [options]\n')
  l('COMMANDS:')
  l('\tstart \tStart tracking a task (trakr start "working")')
  l('\tend   \tEnd tracking a task (trakr end 0)')
  l('\tls    \tList active tasks (trakr ls)')
  l('\thelp  \tPrint this help text')
}

function assert(condition: boolean, message?: string, options?: {
  shouldPrintUsage?: boolean
}) {
  if (!condition) {
    if (message) l(`ASSERTION FAILED: ${message}`)
    if (options?.shouldPrintUsage) printUsage()
    process.exit(1)
  }
}

const args = {
  ensure(condition: boolean, message = "invalid arguments") {
    assert(condition, `ERROR: ${message}`, {
      shouldPrintUsage: true
    })
  }
}

type Task = {
  id: number,
  start: Date,
  end: Date | null,
  info: string
}

class Tasks {
  private _data: Task[] = []

  constructor() {}

  start(info: string, timestamp = new Date) {
    this._data.push({
      id: this._data.length,
      start: timestamp,
      end: null,
      info,
    })
  }

  end(id: number) {
    assert(id < this._data.length, "could not end task - id out of bounds")
    assert(this._data[id].end === null, "could not end task - already ended")
    this._data[id].end = new Date()
  }

  getActive(): Task[] {
    return this._data.filter(task => task.end === null)
  }

  /**
   * Get all tasks that were closed today (same day as the function call)
   */
  getDoneToday(): Task[] {
    const today = (new Date()).getDate()
    return this._data.filter(task => task.end !== null && task.end.getDate() === today)
  }

  async load() {
    const file = Bun.file(TASKS_DB_PATH)
    const exists = await file.exists()
    if (!exists) return

    const json = await file.json()
    assert(json.length !== undefined, "invalid trakr.json - not an array")

    this._data = json.map(task => ({
      ...task,
      start: new Date(task.start),
      end: task.end === null ? null : new Date(task.end)
    }))
  }

  async flush() {
    await Bun.write(TASKS_DB_PATH, JSON.stringify(this._data))
  }
}

const tasks = new Tasks()

function printActiveTasks(active: Task[]) {
  if (active.length === 0) {
    l("No active tasks.")
    return
  }

  l('Active tasks:\n')

  l('ID \tSTART \tINFO')
  for (const task of active) {
    const start = time.string(task.start)
    l(`${task.id} \t${start} \t${task.info}`)
  }
}

function printTodaySummary(done: Task[]) {
  if (done.length === 0) {
    l('No completed tasks today.')
    return
  }

  const times = done.map(task => ({
    ...task,
    duration: Math.abs(task.end.getTime() - task.start.getTime())
  }))

  // descending order of duration
  times.sort(
    (a, b) =>
      a.duration < b.duration ? 1 :
        a.duration > b.duration ? -1 :
          0
  )

  l('Completed tasks:\n')

  l('ID \tSTART \tDURATION \tINFO')
  for (const task of times) {
    const duration = time.duration(task.duration)
    const start = time.string(task.start)
    l(`${task.id} \t${start} \t${duration} \t${task.info}`)
  }
}

const cmds = {
  isSupported(cmd: string) {
    switch (cmd) {
      case "help":
      case "start":
      case "end":
      case "ls":
        return true;
      default:
        return false;
    }
  },

  start() {
    args.ensure(Bun.argv.length > 3, "missing info for start")
    const info = Bun.argv[3].trim()

    tasks.start(info)
  },

  end() {
    args.ensure(Bun.argv.length > 3, "missing id for end")
    const id = parseInt(Bun.argv[3].trim())

    tasks.end(id)
  },

  ls() {
    const active = tasks.getActive()
    const doneToday = tasks.getDoneToday()

    printActiveTasks(active)
    l('')
    printTodaySummary(doneToday)
  }
}

async function main(argv: string[]) {
  args.ensure(Bun.argv.length > 2, "not enough arguments")

  const cmd = Bun.argv[2].trim()
  args.ensure(!!cmd)
  args.ensure(cmds.isSupported(cmd), "unsupported command")

  await tasks.load()

  switch (cmd) {
    case "start": cmds.start(); break;
    case "end"  : cmds.end();   break;
    case "ls"   : cmds.ls();    break;
    case "help":
    default:
      printUsage()
  }

  await tasks.flush()
}

await main()

