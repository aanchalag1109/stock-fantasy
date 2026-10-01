
<?php
/**
 * ALL-IN-ONE: RapidAPI + Timeout Proof Demo
 */

$RAPIDAPI_KEY  = 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5';
$RAPIDAPI_HOST = 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com';
$BASE_URL      = "https://{$RAPIDAPI_HOST}/v1/rapidapi/stock/quote";

$mode   = $_GET['mode'] ?? 'home';
$symbol = strtoupper(trim($_GET['symbol'] ?? 'RELIANCE'));

// ---------------- REAL RAPIDAPI TEST ----------------
function realApiTest($symbol, $key, $host, $url) {
    $ch = curl_init();

    curl_setopt_array($ch, [
        CURLOPT_URL => $url . '?' . http_build_query([
            'tradingSymbol' => $symbol,
            'exchange' => 'NSE'
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => [
            "x-rapidapi-host: {$host}",
            "x-rapidapi-key: {$key}"
        ],
    ]);

    $start = microtime(true);

    $response = curl_exec($ch);
    $error    = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    $time = round(microtime(true) - $start, 2);

    curl_close($ch);

    return [
        'type' => 'REAL API',
        'symbol' => $symbol,
        'time' => $time,
        'http_code' => $httpCode,
        'error' => $error ?: null,
        'success' => $response !== false,
        'timeout' => stripos($error, 'timed out') !== false
    ];
}

// ---------------- FAKE SLOW API (GUARANTEED TIMEOUT) ----------------
function slowApiTest() {
    $url = "https://httpstat.us/200?sleep=10000"; // 10 sec delay

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
    ]);

    $start = microtime(true);

    $response = curl_exec($ch);
    $error    = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    $time = round(microtime(true) - $start, 2);

    curl_close($ch);

    return [
        'type' => 'SLOW API (10s delay)',
        'symbol' => '-',
        'time' => $time,
        'http_code' => $httpCode,
        'error' => $error ?: null,
        'success' => $response !== false,
        'timeout' => stripos($error, 'timed out') !== false
    ];
}

// ---------------- RUN ----------------
$result = null;

if ($mode === 'real') {
    $result = realApiTest($symbol, $RAPIDAPI_KEY, $RAPIDAPI_HOST, $BASE_URL);
}
if ($mode === 'slow') {
    $result = slowApiTest();
}
?>

<!DOCTYPE html>
<html>
<head>
    <title>Timeout Proof Demo</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light p-5">

<div class="container" style="max-width:750px">

    <h3 class="mb-4">?? API Timeout Proof (RapidAPI)</h3>

    <!-- BUTTONS -->
    <div class="card mb-4">
        <div class="card-body">

            <div class="mb-3">
                <label class="form-label">Symbol</label>
                <form method="GET" class="d-flex gap-2">
                    <input type="hidden" name="mode" value="real">
                    <input type="text" name="symbol" class="form-control" value="<?= htmlspecialchars($symbol) ?>">
                    <button class="btn btn-success">Real API Test</button>
                </form>
            </div>

            <hr>

            <a href="?mode=slow" class="btn btn-danger w-100">
                ?? Slow API Test (10s ? 8s timeout proof)
            </a>

        </div>
    </div>

    <!-- RESULT -->
    <?php if ($result): ?>

    <div class="card">
        <div class="card-header <?= $result['success'] ? 'bg-success' : 'bg-danger' ?> text-white">
            <?= $result['type'] ?> Result
        </div>
        <div class="card-body">

            <p><strong>Time Taken:</strong> <?= $result['time'] ?> sec</p>
            <p><strong>HTTP Code:</strong> <?= $result['http_code'] ?></p>
            <p><strong>Error:</strong> <?= $result['error'] ?: 'None' ?></p>

            <?php if ($result['timeout']): ?>
                <div class="alert alert-danger">
                    ? Timeout detected (~<?= $result['time'] ?> sec)
                </div>
            <?php elseif ($result['success']): ?>
                <div class="alert alert-success">
                    ? API responded successfully
                </div>
            <?php else: ?>
                <div class="alert alert-warning">
                    ?? Failed but not timeout
                </div>
            <?php endif; ?>

        </div>
    </div>

    <?php endif; ?>

    <!-- EXPLANATION -->
    <div class="mt-4 text-muted small">
        ?? <strong>Explanation:</strong><br>
        - Slow API intentionally 10 sec delay deti hai<br>
        - System timeout 8 sec pe set hai<br>
        - Isliye request complete hone se pehle cut ho jati hai<br><br>

        ?? Same behavior RapidAPI me hota hai jab API slow hoti hai  
    </div>

</div>

</body>
</html>
