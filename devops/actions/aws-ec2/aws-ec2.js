const core   = require('@actions/core');
const github = require('@actions/github');
const AWS    = require('aws-sdk');

async function main() {
  AWS.config.update({
    accessKeyId:     core.getInput("AWS_ACCESS_KEY"),
    secretAccessKey: core.getInput("AWS_SECRET_KEY"),
    region:          core.getInput("aws-region")
  });
  const test = core.getInput("aws-access-key").length;
  core.info(`XXX ${test}`);
  const ec2 = new AWS.EC2();
  
  const reg_token = core.getInput("RUNNER_REG_TOKEN");
  const label     = "aws_" + Math.random().toString(36).substr(2, 7);
  const timebomb  = core.getInput("aws-ec2-timebomb");
  
  const setup_github_actions_runner = [
    '#!/bin/bash',
    'export RUNNER_ALLOW_RUNASROOT=1',
    'export RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | sed -n "s/.*\"tag_name\": \"v\(.*\)\".*/\1/p")',
    'curl -O -L https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz || shutdown -h now',
    'tar xf ./actions-runner-linux-x64-$RUNNER_VERSION.tar.gz || shutdown -h now',
    `./config.sh --unattended --url https://github.com/${github.context.repo.owner}/${github.context.repo.repo} --token ${reg_token} --labels ${label} --replace || shutdown -h now`,
    `(sleep ${timebomb}; ./config.sh remove --token ${reg_token}; shutdown -h now) &`, // timebomb to avoid paying for stale AWS instances
    `./run.sh --once`,
    `./config.sh remove --token ${reg_token}`,
    'shutdown -h now'
  ];
  
  try {
    const result = await ec2.runInstances({
      ImageId: core.getInput("aws-ami"),
      InstanceType: core.getInput("aws-ec2-type"),
      InstanceMarketOptions: { MarketType: "spot" },
      InstanceInitiatedShutdownBehavior: "terminate",
      UserData: Buffer.from(setup_github_actions_runner.join('\n')).toString('base64'),      
      MinCount: 1,
      MaxCount: 1,
      TagSpecifications: [ { ResourceType: "instance", Tags: [
        { Key: "Label", Value: label }
      ] } ]
    }).promise();
    const ec2InstanceId = result.Instances[0].InstanceId;
    core.info(`Created AWS EC2 spot instance ${ec2InstanceId} with ${label} label`);
  } catch (error) {
    core.error(`Error creating AWS EC2 spot instance with ${label} label`);
    throw error;
  }
}

(async function () {
  try {
    main();
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();
