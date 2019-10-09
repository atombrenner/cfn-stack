import { EnvironmentCredentials, SharedIniFileCredentials, EC2MetadataCredentials } from 'aws-sdk'
import { AWSError, CloudFormation } from 'aws-sdk'
import { StackEvent, UpdateStackInput, ResourceStatus } from 'aws-sdk/clients/cloudformation'
import * as wrap from 'word-wrap'

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export type StackOptions = {
  name: string
  region: string
  profile?: string
}

export class Stack {
  constructor({ name, region, profile }: StackOptions) {
    this.stack = { StackName: name }
    const credentials = Stack.getCredentials(profile)
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
      await this.cloudformation.updateStack(stackInput).promise()
      this.logStackAction(now, 'Updating stack')
      await this.waitFor('UPDATE_COMPLETE', now)
    } catch (err) {
      if (Stack.doesNotExist(err)) {
        await this.cloudformation.createStack({ OnFailure: 'DELETE', ...stackInput }).promise()
        this.logStackAction(now, 'Creating new stack')
        await this.waitFor('CREATE_COMPLETE', now)
      } else if (Stack.isUpToDate(err)) {
        this.logStackAction(now, 'No updates needed for stack')
      } else throw err
    }
  }

  private static doesNotExist(err: AWSError): boolean {
    return err.code === 'ValidationError' && err.message.includes('does not exist')
  }

  private static isUpToDate(err: AWSError): boolean {
    return err.code === 'ValidationError' && err.message.includes('No updates are to be performed')
  }

  async waitFor(success: ResourceStatus, start: Date): Promise<void> {
    const stackId = { StackName: await this.getStackId() }
    const shown = new Set<string>()
    const finished =
      /(CREATE_COMPLETE|UPDATE_COMPLETE|DELETE_COMPLETE|ROLLBACK_COMPLETE|ROLLBACK_FAILED|CREATE_FAILED|DELETE_FAILED)$/
    let status = ''
    while (!status.match(finished)) {
      await sleep(1500)
      const response = await this.cloudformation.describeStackEvents(stackId).promise()
      const events = response.StackEvents || []
      events
        .filter((e) => e.Timestamp >= start && !shown.has(e.EventId))
        .reverse()
        .forEach((e) => {
          logEvent(e)
          shown.add(e.EventId)
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
    const response = await this.cloudformation.describeStacks(this.stack).promise()
    if (!response.Stacks || response.Stacks.length !== 1)
      throw Error(`No StackId for stack "${this.stack.StackName} found`)

    return response.Stacks[0].StackId
  }

  async getOutputs(): Promise<Record<string, string>> {
    const outputs: Record<string, string> = {}
    const response = await this.cloudformation.describeStacks(this.stack).promise()
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
    await this.cloudformation.deleteStack(this.stack).promise()
    this.logStackAction(now, 'Deleting stack')
    await this.waitFor('DELETE_COMPLETE', now)
  }

  private static getCredentials(profile?: string) {
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
      return new EnvironmentCredentials('AWS')

    if (process.env.USER === 'ec2-user') return new EC2MetadataCredentials()

    process.env.AWS_SDK_LOAD_CONFIG = 'true' // This is necessary to load profiles from ~/.aws/config
    return new SharedIniFileCredentials({ profile })
  }
}

function logEvent(e: StackEvent) {
  const props = [
    fmtTime(e.Timestamp),
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

const fmtTime = (date: Date) => date.toISOString().substr(11, 8)
