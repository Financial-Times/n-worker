# n-worker
Setup of basic next enhancements for non-web dynos e.g. cron-jobs, pollers

## API

### n-worker#setup(options)
Sets up node enhamcemets
 - Promise, fetch and array.find
 - metrics for processes and fetch
 - flags (optional)

 options:
  - `withFlags` default false - waits for the flags client to initialise and start polling
  - `name` optional - will get the app name from package.json if absent
  - `directory` defaults to `process.cwd()` directory in which to look for config code

Returns a Promise.

Usage:
`javascript
worker.setup(options).then(function(){
	//Application init code
})
`

### n-worker#start()
Logs to graphite when the worker has successfully started. Must be calle in your application code

### n-worker#CronJob(options)
Constructor for a new cron job, with metrics etc. added. `options` expects the same as [npm cron](https://www.npmjs.com/package/cron).CronJob

### n-worker#metrics
Reference to the instance of metrics used by the job

### n-worker#flags
Reference to the instance of flags used by the job


