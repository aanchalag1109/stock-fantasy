<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ProbTrade — Fantasy Trading Contest App</title>
    <meta name="description" content="ProbTrade is a skill-based trading contest platform where you can practice, compete, and earn from the markets. No Capital, No Risk — just skills, strategy, and rewards.">
    <meta name="keywords" content="probtrade, stock trading, share market, investment, portfolio, NSE, BSE, trading platform">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="ProbTrade — Fantasy Trading Contest App">
    <meta property="og:description" content="ProbTrade is a skill-based trading contest platform where you can practice, compete, and earn from the markets. No Capital, No Risk — just skills, strategy, and rewards.">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="en_IN">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="ProbTrade — Fantasy Trading Contest App">
    <meta name="twitter:description" content="ProbTrade is a skill-based trading contest platform where you can practice, compete, and earn from the markets. No Capital, No Risk — just skills, strategy, and rewards.">
  <link rel="icon" type="image/x-icon" href="/img/favicon.ico">

<!-- PNG favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/img/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32x32.png">

<!-- Android -->
<link rel="icon" type="image/png" sizes="192x192" href="/img/android-chrome-192x192.png">
<link rel="icon" type="image/png" sizes="512x512" href="/img/android-chrome-512x512.png">

<!-- Apple -->
<link rel="apple-touch-icon" sizes="180x180" href="/img/apple-touch-icon.png">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">

<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '741022945501306');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=741022945501306&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->

    <style>
        :root {
            --primary-blue: #2563EB;
            --light-blue-bg: #EFF6FF;
            --dark-text: #1E293B;
            --gray-text: #64748B;
        }
        body {
            font-family: 'Poppins', sans-serif;
            color: var(--dark-text);
            overflow-x: hidden;
        }
        .text-primary-custom { color: var(--primary-blue); }
        .bg-light-blue { background-color: var(--light-blue-bg); }
        .fw-bold { font-weight: 700 !important; }
        .btn-primary-custom {
            background-color: var(--primary-blue);
            border-color: var(--primary-blue);
            color: white;
            padding: 10px 25px;
            border-radius: 50px;
            font-weight: 500;
            transition: all 0.3s;
        }
        .btn-primary-custom:hover {
            background-color: #1d4ed8;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }
        .navbar {
            padding: 15px 0;
            background: white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .nav-link {
            font-weight: 500;
            color: var(--dark-text) !important;
            margin: 0 10px;
        }
        .hero-section {
            padding: 40px 0;
            background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%);
        }
        .hero-title {
            font-size: 2.5rem;
            line-height: 1.2;
        }
        @media (min-width: 768px) {
            .hero-title {
                font-size: 3.2rem;
            }
        }
        .phone-mockup {
            max-width: 500px;
            width: 100%;
            border-radius: 40px;
        }
        .custom-card {
            border: none;
            border-radius: 20px;
            background: white;
            box-shadow: 0 10px 30px rgba(0,0,0,0.05);
            transition: transform 0.3s;
            padding: 30px 20px;
        }
        .custom-card:hover {
            transform: translateY(-5px);
        }
        .step-icon {
            width: 60px;
            height: 60px;
            background: var(--light-blue-bg);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--primary-blue);
            font-size: 1.5rem;
            margin: 0 auto 20px;
        }
        .step-arrow {
            display: none;
            color: var(--primary-blue);
            font-size: 1.5rem;
            margin-top: 50px;
        }
        @media (min-width: 992px) {
            .step-arrow { display: block; }
        }
        .market-card {
            background: white;
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            margin-bottom: 20px;
            border: 1px solid #f1f1f1;
        }
        .prize-text {
            color: var(--primary-blue);
            font-size: 1.8rem;
            font-weight: 700;
        }
        .progress {
            height: 8px;
            border-radius: 10px;
        }
        .review-card {
            background: white;
            border: 1px solid #eee;
            border-radius: 15px;
            padding: 25px;
            margin: 10px;
        }
        .user-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background-color: var(--primary-blue);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            margin-right: 15px;
        }
        .stars { color: #FFD700; font-size: 0.8rem; }
        .trust-stat {
            text-align: center;
            margin-top: 40px;
        }
        .trust-stat h4 { color: var(--primary-blue); font-weight: 700; }
        .trust-stat p { font-size: 0.8rem; color: var(--gray-text); }
        .cta-section {
            background: linear-gradient(180deg, #F0F9FF 0%, #FFFFFF 100%);
            padding: 80px 0;
            text-align: center;
        }
        footer {
            background-color: #F8F9FA;
            padding: 60px 0 20px;
            font-size: 0.9rem;
        }
        footer h5 { font-weight: 600; margin-bottom: 20px; }
        footer a { color: var(--gray-text); text-decoration: none; display: block; margin-bottom: 10px; }
        footer a:hover { color: var(--primary-blue); }
        .app-badge {
            background: #6f42c1;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            display: inline-flex;
            align-items: center;
            text-decoration: none !important;
        }
        .app-badge:hover { color: white; opacity: 0.9; }
    </style>
    <meta name="google-site-verification" content="hcjo-c4aam2Q7RzXcs8GN4Ns9tW5nDEXWb6xs_BLfuE" />
</head>
<body>

    <nav class="navbar navbar-expand-lg fixed-top">
        <div class="container">
            <a class="navbar-brand fw-bold text-primary-custom" href="/">
                <img src="/img/logo.png" alt="ProbTrade" style="height: 40px;">
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav mx-auto">
                    <li class="nav-item"><a class="nav-link" href="/">Home</a></li>
                    <li class="nav-item"><a class="nav-link" href="how-it-works">How it Works</a></li>
                    <li class="nav-item"><a class="nav-link" href="about">About Us</a></li>
                    <li class="nav-item"><a class="nav-link" href="contact">Contact Us</a></li>
                </ul>
                <a href="https://probtrade.com/admin/public/prob.apk" class="btn btn-primary-custom">Download</a>
            </div>
        </div>
    </nav>
