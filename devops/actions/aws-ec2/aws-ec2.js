const core   = require('@actions/core');
const github = require('@actions/github');
const AWS    = require('aws-sdk');

const repo = `${github.context.repo.owner}/${github.context.repo.repo}`;

async function getGithubRegToken() {
  const octokit = github.getOctokit(core.getInput("GH_PERSONAL_ACCESS_TOKEN"));

  try {
    const response = await octokit.request(`POST /repos/${repo}/actions/runners/registration-token`);
    core.info("Got Github Actions Runner registration token");
    return response.data.token;
  } catch (error) {
    core.error("Error getting Github Actions Runner registration token");
    throw error;
  }
}

async function start(label) {
  const ec2 = new AWS.EC2();
  
  const reg_token = await getGithubRegToken();
  const timebomb  = core.getInput("aws-timebomb");
  const ec2type   = core.getInput("aws-type");
  const ec2disk   = core.getInput("aws-disk");
  
  const setup_github_actions_runner = [
    `#!/bin/bash -x`,
    `mkdir actions-runner`,
    `cd actions-runner`,
    `export RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | sed -n \'s,.*"tag_name": "v\\(.*\\)".*,\\1,p\')`,
    `curl -O -L https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz || shutdown -h now`,
    `tar xf ./actions-runner-linux-x64-$RUNNER_VERSION.tar.gz || shutdown -h now`,
    `su gh_runner -c "./config.sh --unattended --url https://github.com/${repo} --token ${reg_token} --name ${label}_${ec2type} --labels ${label} --replace || shutdown -h now"`,
    `(sleep ${timebomb}; su gh_runner -c "./config.sh remove --token ${reg_token}"; shutdown -h now) &`, // timebomb to avoid paying for stale AWS instances
    `su gh_runner -c "./run.sh"`, // --ephemeral
    `su gh_runner -c "./config.sh remove --token ${reg_token}"`,
    `shutdown -h now`
  ];
  
  let ec2id;
  try {
    let params = {
      ImageId: core.getInput("aws-ami"),
      InstanceType: ec2type,
      InstanceMarketOptions: { MarketType: "spot" },
      InstanceInitiatedShutdownBehavior: "terminate",
      UserData: Buffer.from(setup_github_actions_runner.join('\n')).toString('base64'),
      //KeyName: "aws_apstasen",
      MinCount: 1,
      MaxCount: 1,
      TagSpecifications: [ { ResourceType: "instance", Tags: [
        { Key: "Label", Value: label }
      ] } ]
    };
    if (ec2disk) {
      const items = ec2disk.split(':');
      params.BlockDeviceMappings = [ { DeviceName: items[0], Ebs: { VolumeSize: items[1] } } ];
    }
    const result = await ec2.runInstances(params).promise();
    ec2id = result.Instances[0].InstanceId;
    core.info(`Created AWS EC2 spot instance ${ec2id} with ${label} label`);
  } catch (error) {
    core.error(`Error creating AWS EC2 spot instance with ${label} label`);
    throw error;
  }
  
  try {
    await ec2.waitFor("instanceRunning", { Filters: [ { Name: "tag:Label", Values: [ label ] } ] }).promise();
    core.info(`Found running AWS EC2 spot instance ${ec2id} with ${label} label`);
  } catch (error) {
    core.error(`Error searching for running AWS EC2 spot instance ${ec2id} with ${label} label`);
    throw error;
  }
}

async function stop(label) {
  const ec2 = new AWS.EC2();
  
  try {
    const result = await ec2.describeInstances({ Filters: [ { Name: "tag:Label", Values: [ label ] } ] }).promise();
    core.info(`Searched for AWS EC2 instance with label ${label}`);
    for (const reservation of result.Reservations) {
      for (const instance of reservation.Instances) {
        try {
          await ec2.terminateInstances({ InstanceIds: [instance.InstanceId] }).promise();
          core.info(`Terminated AWS EC2 instance ${instance.InstanceId} with label ${label}`);
        } catch (error) {
          core.info(`Error terminating AWS EC2 instance ${instance.InstanceId} with label ${label}`);
          throw error;
        }
      }
    }
  } catch (error) {
    core.info(`Error searching for AWS EC2 instance with label ${label}`);
    throw error;
  }
  
  try {
    const octokit = github.getOctokit(core.getInput("GH_PERSONAL_ACCESS_TOKEN"));
    const runners = await octokit.paginate(`GET /repos/${repo}/actions/runners`);
    core.info(`Searched for Github action runners with label ${label}`);
    for (runner of runners) {
      let label_found = false;
      for (label_obj of runner.labels) if (label_obj.name == label) { label_found = true; break; }
      if (label_found) try {
        await octokit.request(`DELETE /repos/${repo}/actions/runners/${runner.id}`);
        core.info(`Removed Github self-hosted runner ${runner.id} with ${label}`);
      } catch (error) {
        core.error(`Error removing Github self-hosted runner ${runner.id} with ${label}`);
        throw error;
      }
    }
  } catch (error) {
    core.info(`Error searching for Github action runners with label ${label}`);
    throw error;
  }
}

(async function () {
  try {
    AWS.config.update({
      accessKeyId:     core.getInput("AWS_ACCESS_KEY"),
      secretAccessKey: core.getInput("AWS_SECRET_KEY"),
      region:          core.getInput("aws-region")
    });
    const mode  = core.getInput("mode");
    const label = core.getInput("label");
    if (mode == "start") {
      await start(label);
    } else if (mode == "stop") {
      await stop(label);
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();
