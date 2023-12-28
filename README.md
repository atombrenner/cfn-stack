## @atombrenner/cfn-stack

Manage CloudFormation Stacks with Typescript

### Installation

`npm i -D @atombrenner/cfn-stack`

### Usage

```typescript
import { Stack } from '@atombrenner/cfn-stack'
import * as fs from 'fs'

async function main() {
  const stack = new Stack({ name: 'cfn-stack-test', region: 'eu-west-1', profile: 'atombrenner' })
  const template = fs.readFileSync('./cloudformation.yaml', { encoding: 'utf-8' })

  // create or update stack and wait for completion log events
  const params: Record<string, string> = { Env: 'stage' }
  await stack.createOrUpdate(template, params)

  // access stack outputs
  const outputs: Record<string, string> = await stack.getOutputs()
  console.log('Outputs: ' + JSON.stringify(outputs))
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1) // exit the process with an error code
})
```

### Example Output

```
16:27:28 Updating stack "cfn-stack-test"
========
16:27:28 CREATE_COMPLETE AWS::CloudFormation::Stack "cfn-stack-test"
16:27:30 UPDATE_IN_PROGRESS AWS::CloudFormation::Stack "cfn-stack-test"
         User Initiated
16:27:34 UPDATE_IN_PROGRESS AWS::IAM::Role "SomeRole"
         Requested update requires the creation of a new physical resource; hence creating one.
16:27:35 UPDATE_IN_PROGRESS AWS::IAM::Role "SomeRole"
         Resource creation Initiated
16:27:53 UPDATE_COMPLETE AWS::IAM::Role "SomeRole"
16:27:55 UPDATE_COMPLETE_CLEANUP_IN_PROGRESS AWS::CloudFormation::Stack "cfn-stack-test"
16:27:56 DELETE_IN_PROGRESS AWS::IAM::Role "SomeRole"
16:27:58 DELETE_COMPLETE AWS::IAM::Role "SomeRole"
16:27:59 UPDATE_COMPLETE AWS::CloudFormation::Stack "cfn-stack-test"
========
```
