import { Stack } from '../src/index'
import { readFileSync } from 'fs'
import { setTimeout } from 'timers/promises'

async function main() {
  const stack = new Stack({ name: 'cfn-stack-test', region: 'eu-west-1', profile: 'atombrenner' })
  const template = readFileSync('./test/cloudformation.yaml', 'utf-8')

  // create stack and log events
  await stack.createOrUpdate(template, { Env: 'test1' })
  console.log('Outputs: ' + JSON.stringify(await stack.getOutputs()))
  await setTimeout(500)

  // update stack and log events
  await stack.createOrUpdate(template, { Env: 'test2' })
  console.log(JSON.stringify(await stack.getOutputs()))
  await setTimeout(500)

  // update unchanged stack
  await stack.createOrUpdate(template, { Env: 'test2' })
  console.log(JSON.stringify(await stack.getOutputs()))

  // delete stack
  await stack.delete()
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
