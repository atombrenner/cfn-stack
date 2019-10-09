import { Stack, sleep } from '../src/index'
import * as fs from 'fs'
;(async () => {
  const stack = new Stack({ name: 'cfn-stack-test', region: 'eu-west-1', profile: 'atombrenner' })
  const template = fs.readFileSync('./test/cloudformation.yaml', { encoding: 'utf-8' })

  // create stack and log events
  await stack.createOrUpdate(template, { Env: 'test1' })
  console.log('Outputs: ' + JSON.stringify(await stack.getOutputs()))
  sleep(500)

  // update stack and log events
  await stack.createOrUpdate(template, { Env: 'test2' })
  console.log(JSON.stringify(await stack.getOutputs()))
  sleep(500)

  // update unchanged stack
  await stack.createOrUpdate(template, { Env: 'test2' })
  console.log(JSON.stringify(await stack.getOutputs()))

  // delete stack
  await stack.delete()
})().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
