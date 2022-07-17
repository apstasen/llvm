const core   = require('@actions/core');
const github = require('@actions/github');
const AWS    = require('aws-sdk');

async function main() {
  AWS.config = new AWS.Config();
  AWS.config.accessKeyId     = core.getInput('AWS_ACCESS_KEY_ID');
  AWS.config.secretAccessKey = core.getInput('AWS_SECRET_ACCESS_KEY');

  const ec2 = new AWS.EC2({region: "us-east-1"});
  
  const reg_token = core.getInput('GITHUB_REG_TOKEN');
  const label     = "aws_" + Math.random().toString(36).substr(2, 7);
  
  const setup_github_actions_runner = [
    '#!/bin/bash',
    'export RUNNER_ALLOW_RUNASROOT=1',
    'export RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | sed -n "s/.*\"tag_name\": \"v\(.*\)\".*/\1/p")',
    'curl -O -L https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz || shutdown -h now',
    'tar xf ./actions-runner-linux-x64-$RUNNER_VERSION.tar.gz || shutdown -h now',
    `./config.sh --unattended --url https://github.com/${github.context.repo.owner}/${github.context.repo.repo} --token ${reg_token} --labels ${label} --replace || shutdown -h now`,
    `(sleep 5m; ./config.sh remove --token ${reg_token}; shutdown -h now) &`, // timebomb to avoid paying for stale AWS instances
    `./run.sh --once`,
    `./config.sh remove --token ${reg_token}`,
    'shutdown -h now'
  ];
  
  try {
    const result = await ec2.requestSpotInstances({
      ImageId: "ami-068257025f72f470d", // Canonical, Ubuntu, 22.04 LTS, amd64 jammy image build on 2022-06-09
      InstanceType: "t2.micro",
      InstanceInitiatedShutdownBehavior: "terminate",
      LaunchSpecification: {
        UserData: Buffer.from(setup_github_actions_runner.join('\n')).toString('base64')
      },
      TagSpecifications: [ { ResourceType: "instance", Tags: [
        { Key: "Label", value: label }
      ] } ]
    }).promise();
    const spotFleetRequestId = result.SpotFleetRequestId;
    core.info(`Created AWS EC2 spot instance request ${spotFleetRequestId} for spot instance with ${label} label`);
  } catch (error) {
    core.error(`Error creating AWS EC2 spot instance request for spot instance with ${label} label`);
    throw error;
  }

  try {
    await ec2.waitFor("instanceRunning", { Filters: [ { Name: "tag:Label", Values: [ label ] } ] }).promise();
    core.info(`Created AWS EC2 spot instance with ${label} label in ${spotFleetRequestId} spot instance request`);
    core.setOutput('label', label);
  } catch (error) {
    core.error(`Error creating AWS EC2 spot instance with ${label} label in ${spotFleetRequestId} spot instance request`);
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
