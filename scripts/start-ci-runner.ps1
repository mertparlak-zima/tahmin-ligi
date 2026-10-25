$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $PSScriptRoot '../infra/runner/compose.yml'

docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and wait for the Linux engine.' }
docker image inspect dt-ci-runner:latest --format '{{.Id}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Required local dt-ci-runner:latest image is missing; see ../../docs/runners.md.' }

$existing = docker container ls -a --filter 'name=^/tahmin-ligi-docker-1$' --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect runner container.' }
if ($existing -eq 'tahmin-ligi-docker-1') {
    docker start tahmin-ligi-docker-1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not start existing runner.' }
} else {
    docker compose -f $composeFile up -d
    if ($LASTEXITCODE -ne 0) { throw 'Runner creation failed.' }
}

docker exec tahmin-ligi-docker-1 test -f /home/runner/.runner
if ($LASTEXITCODE -ne 0) {
    # Pass the registration token only via stdin; never persist in compose or logs.
    $registrationJson = gh api --method POST repos/mertparlak-zima/tahmin-ligi/actions/runners/registration-token
    if ($LASTEXITCODE -ne 0) { throw 'GitHub runner registration token request failed.' }
    $registration = $registrationJson | ConvertFrom-Json
    if (-not $registration.token) { throw 'GitHub returned no registration token.' }
    try {
        $registration.token.Trim() | docker exec -i tahmin-ligi-docker-1 bash -c 'set -f; read -r registration_token; registration_token=$(printf %s $registration_token | tr -d [:space:]); cd /home/runner; exec gosu runner:runner ./config.sh --url $REPO_URL --token $registration_token --name $RUNNER_NAME --labels $RUNNER_LABELS --unattended --replace'
        if ($LASTEXITCODE -ne 0) { throw 'Runner registration failed.' }
    } finally {
        $registration = $null
        $registrationJson = $null
    }
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $runnerJson = gh api repos/mertparlak-zima/tahmin-ligi/actions/runners
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify GitHub runner state.' }
    $runner = ($runnerJson | ConvertFrom-Json).runners | Where-Object name -EQ 'tahmin-ligi-docker-1'
    $actualLabels = @($runner.labels.name | ForEach-Object { ([string]$_).ToLowerInvariant() })
    $expectedLabels = @('self-hosted', 'linux', 'x64', 'docker', 'tahmin-ligi')
    $missingLabels = @($expectedLabels | Where-Object { $_ -notin $actualLabels })
    if ($runner.status -eq 'online' -and $missingLabels.Count -eq 0) {
        Write-Output 'tahmin-ligi-docker-1 is online with all expected labels.'
        exit 0
    }
    Start-Sleep -Seconds 2
}
throw 'Runner did not become online with the expected labels within 60 seconds.'
