import {
  CloudFormation,
  StackEvent,
  UpdateStackInput,
  ResourceStatus,
} from '@aws-sdk/client-cloudformation'
import { defaultProvider } from '@aws-sdk/credential-provider-node'
import wrap from 'word-wrap'

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export type StackOptions = {
  name: string
  region?: string
  profile?: string
}

export class Stack {
  constructor({ name, region, profile }: StackOptions) {
    this.stack = { StackName: name }
    const credentials = defaultProvider({ profile })
    this.cloudformation = new CloudFormation({ region, credentials })
  }

  private stack: { StackName: string }
  private readonly cloudformation: CloudFormation

  private logStackAction(date: Date, msg: string) {
    console.log(`\n${fmtTime(date)} ${msg} "${this.stack.StackName}"\n${'='.repeat(8)}`)
  }

  async createOrUpdate(
    template: string,
    params: Record<string, string | undefined>,
  ): Promise<void> {
    const stackInput: UpdateStackInput = {
      ...this.stack,
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      TemplateBody: template,
      Parameters: Object.entries(params).map(([key, value]) => ({
        ParameterKey: key,
        ParameterValue: value,
        UsePreviousValue: value === undefined || value === null,
      })),
    }
    const now = new Date()
    try {
      await this.cloudformation.updateStack(stackInput)
      this.logStackAction(now, 'Updating stack')
      await this.waitFor(ResourceStatus.UPDATE_COMPLETE, now)
    } catch (err) {
      if (stackDoesNotExist(err)) {
        await this.cloudformation.createStack({ OnFailure: 'DELETE', ...stackInput })
        this.logStackAction(now, 'Creating new stack')
        await this.waitFor(ResourceStatus.CREATE_COMPLETE, now)
      } else if (stackIsUpToDate(err)) {
        this.logStackAction(now, 'No updates needed for stack')
      } else throw err
    }
  }

  async waitFor(success: ResourceStatus, start: Date): Promise<void> {
    const stackId = { StackName: await this.getStackId() }
    const shown = new Set<string>()
    const finished =
      /(CREATE_COMPLETE|UPDATE_COMPLETE|DELETE_COMPLETE|ROLLBACK_COMPLETE|ROLLBACK_FAILED|CREATE_FAILED|DELETE_FAILED)$/ // TODO: some of the aws-sdk-v2 states are not part of aws-sdk-v3, especially the rollback states
    let status = ''
    while (!status.match(finished)) {
      await sleep(1500)
      const response = await this.cloudformation.describeStackEvents(stackId)
      const events = response.StackEvents || []
      events
        .filter((e) => e.Timestamp! >= start && !shown.has(e.EventId!))
        .reverse()
        .forEach((e) => {
          logEvent(e)
          shown.add(e.EventId!)
          if (e.ResourceType === 'AWS::CloudFormation::Stack') {
            status = e.ResourceStatus || ''
          }
        })
    }
    console.log('='.repeat(8))
    if (status !== success) {
      throw Error(`Unexpected Stack Status ${status}`)
    }
  }

  private async getStackId() {
    const response = await this.cloudformation.describeStacks(this.stack)
    if (!response.Stacks || response.Stacks.length !== 1)
      throw Error(`No StackId for stack "${this.stack.StackName} found`)

    return response.Stacks[0].StackId
  }

  async getOutputs(): Promise<Record<string, string>> {
    const outputs: Record<string, string> = {}
    const response = await this.cloudformation.describeStacks(this.stack)
    if (response.Stacks && response.Stacks.length === 1 && response.Stacks[0].Outputs) {
      response.Stacks[0].Outputs.forEach((o) => {
        if (o.OutputKey && o.OutputValue) {
          outputs[o.OutputKey] = o.OutputValue
        }
      })
    }
    return outputs
  }

  async delete(): Promise<void> {
    const now = new Date()
    await this.cloudformation.deleteStack(this.stack)
    this.logStackAction(now, 'Deleting stack')
    await this.waitFor(ResourceStatus.DELETE_COMPLETE, now)
  }
}

function stackDoesNotExist(err: any): boolean {
  return err.Code === 'ValidationError' && err.message.includes('does not exist')
}

function stackIsUpToDate(err: any): boolean {
  return err.Code === 'ValidationError' && err.message.includes('No updates are to be performed')
}

function logEvent(e: StackEvent) {
  const props = [
    fmtTime(e.Timestamp!),
    e.ResourceStatus,
    e.ResourceType,
    `"${e.LogicalResourceId}"`,
    fmtReason(e.ResourceStatusReason),
  ]
  const line = props.map((s) => s || '').join(' ')
  console.log(line)
}

const fmtReason = (reason?: string): string =>
  reason ? '\n' + wrap(reason, { width: 90, indent: ' '.repeat(9) }) : ''

const fmtTime = (date: Date) => date.toISOString().substring(11, 19)
