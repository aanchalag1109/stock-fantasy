<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ config('app.name', 'Admin Panel') }} | @yield('title', 'Dashboard')</title>
    
    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Bootstrap Icons -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    <!-- Custom CSS -->
    <style>
        /* Desktop sidebar and content layout */
        @media (min-width: 992px) {
            .sidebar {
                position: fixed !important;
                left: 0;
                top: 0;
                width: 250px !important;
                height: 100vh;
                z-index: 1040;
                transform: none !important;
            }
            .content-wrapper {
                margin-left: 250px !important;
                transition: margin-left 0.3s cubic-bezier(.4,0,.2,1);
            }
        }
        /* Sidebar overlay and content push for mobile */
        @media (max-width: 991.98px) {
            body.sidebar-open {
                overflow: hidden;
            }
            .sidebar {
                left: 0;
                top: 0;
                height: 100vh;
                box-shadow: 2px 0 16px rgba(44,62,80,0.18);
                background: linear-gradient(135deg, #232526 0%, #414345 100%);
                transform: translateX(-100%);
                transition: transform 0.3s cubic-bezier(.4,0,.2,1);
                z-index: 4000 !important;
            }
            .sidebar.open {
                transform: translateX(0);
            }
            .content-wrapper {
                margin-left: 0 !important;
                transition: none;
            }
            .navbar {
                position: sticky;
                top: 0;
                z-index: 1050;
            }
        }
        /* Mobile Responsive Sidebar & Layout */
        @media (max-width: 991.98px) {
            .sidebar {
                position: fixed !important;
                left: 0;
                top: 0;
                width: 80vw !important;
                max-width: 320px !important;
                min-width: 0 !important;
                z-index: 1040;
                transform: translateX(-100%);
                transition: transform 0.3s cubic-bezier(.4,0,.2,1);
            }
            .sidebar.open {
                transform: translateX(0);
            }
            .content-wrapper {
                margin-left: 0 !important;
                padding-top: 56px;
            }
            .navbar {
                position: sticky;
                top: 0;
                z-index: 1050;
            }
        }
        @media (max-width: 575.98px) {
            .sidebar {
                width: 100vw !important;
                max-width: 100vw !important;
            }
            .sidebar-logo img {
                height: 24px;
            }
            .btn, .form-control, .form-select {
                font-size: 0.95rem;
                padding: 0.4rem 1rem;
            }
            .table th, .table td {
                font-size: 0.92rem;
            }
        }
            /* Global Modern Admin Styles */
            body, html {
                font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
                background: #f5f6fa;
                color: #23272f;
            }
            h1, h2, h3, h4, h5, h6 {
                font-weight: 700;
                color: #23272f;
            }
            .card {
                border-radius: 1rem;
                box-shadow: 0 2px 16px rgba(44,62,80,0.08);
                border: none;
                background: #fff;
            }
            .card-header {
                background: #fff;
                border-bottom: 1px solid #f0f1f3;
                font-weight: 600;
                font-size: 1.1rem;
            }
            .table {
                border-radius: 0.75rem;
                overflow: hidden;
                background: #fff;
                font-size: 0.98rem;
                color: #000;
            }
            .table th {
                background: #f5f6fa;
                color: #6c757d;
                font-weight: 600;
                border: none;
            }
            .table td {
                border: none;
                vertical-align: middle;
            }
            .btn {
                border-radius: 0.5rem;
                font-weight: 500;
                padding: 0.5rem 1.25rem;
                transition: background 0.2s, color 0.2s;
            }
            .btn-primary {
                background: linear-gradient(90deg, #1677ff 0%, #11cdef 100%);
                border: none;
            }
            .btn-outline-primary {
                border-color: #1677ff;
                color: #1677ff;
            }
            .btn-outline-primary:hover {
                background: #1677ff;
                color: #fff;
            }
            .form-control {
                border-radius: 0.5rem;
                border: 1px solid #e0e3e7;
                font-size: 1rem;
            }
            .badge {
                border-radius: 1rem;
                font-size: 0.85rem;
                font-weight: 600;
                padding: 0.4em 0.8em;
            }
            .avatar {
                border-radius: 50%;
                background: #1677ff;
                color: #fff;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            }
            .shadow-sm {
                box-shadow: 0 2px 8px rgba(44,62,80,0.08)!important;
            }
            @media (max-width: 991.98px) {
                .card {
                    border-radius: 0.75rem;
                }
                .sidebar {
                    width: 220px !important;
                }
            }
            .sidebar {
                overflow-y: auto;
                max-height: 100vh;
                scrollbar-width: thin;
                scrollbar-color: #1677ff #232526;
                overscroll-behavior-y: contain;
            }
            .sidebar::-webkit-scrollbar {
                width: 8px;
            }
            .sidebar::-webkit-scrollbar-thumb {
                background: #1677ff;
                border-radius: 8px;
            }
            .sidebar::-webkit-scrollbar-track {
                background: #232526;
            }
            [x-cloak] { display: none !important; }
            .sidebar {
                min-height: 100vh;
                transition: all 0.3s cubic-bezier(.4,0,.2,1);
                background: linear-gradient(135deg, #232526 0%, #414345 100%);
                box-shadow: 2px 0 16px rgba(44,62,80,0.08);
            }
            .sidebar-logo {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1.5rem 0 1rem 0;
            }
            .sidebar-logo img {
                height: 32px;
                margin-right: 0.5rem;
            }
            .sidebar-section {
                padding: 0.75rem 1.5rem 0.25rem 1.5rem;
                font-size: 0.75rem;
                color: #b0b3b8;
                letter-spacing: 1px;
                text-transform: uppercase;
            }
            .sidebar-divider {
                border-bottom: 1px solid #343a40;
                margin: 0.5rem 0;
            }
            .sidebar-link {
                color: #f8f9fa;
                text-decoration: none;
                display: flex;
                align-items: center;
                padding: 0.65rem 1.25rem;
                border-radius: 0.5rem;
                margin-bottom: 0.25rem;
                font-weight: 500;
                font-size: 1rem;
                transition: background 0.2s, color 0.2s;
                position: relative;
            }
            .sidebar-link.active {
                background: linear-gradient(90deg, #1677ff 0%, #11cdef 100%);
                color: #fff;
                box-shadow: 0 2px 8px rgba(22,119,255,0.08);
            }
            .sidebar-link:hover {
                background: rgba(22,119,255,0.12);
                color: #fff;
            }
            .sidebar-link i {
                width: 1.5rem;
                text-align: center;
                margin-right: 0.75rem;
                font-size: 1.2rem;
            }
            .sidebar .nav {
                margin-bottom: 1rem;
            }
            @media (max-width: 991.98px) {
                .sidebar {
                    width: 220px !important;
                }
            }


  h5{
    color:white !important;
  }

    </style>
    @yield('head')
</head>
<body class="bg-light" x-data="{ sidebarOpen: true, dropdownOpen: false, notificationOpen: false }">
    <!-- Mobile sidebar backdrop -->
    <div x-show="sidebarOpen && window.innerWidth < 992" @click="sidebarOpen = false" class="position-fixed w-100 bg-dark opacity-50" style="z-index: 3000; top:56px; height:calc(100vh - 56px);" x-cloak></div>

    <!-- Sidebar -->
    <div class="sidebar text-white d-flex flex-column d-lg-block" :class="{ 'open': sidebarOpen, 'd-none': !sidebarOpen && window.innerWidth < 992 }" style="width: 250px; z-index: 1040;">
        <script>
            document.addEventListener('alpine:init', () => {
                Alpine.store('sidebar', {
                    open: false,
                });
            });
            document.addEventListener('DOMContentLoaded', function() {
                Alpine.effect(() => {
                    if (Alpine.store('sidebar').open && window.innerWidth < 992) {
                        document.body.classList.add('sidebar-open');
                    } else {
                        document.body.classList.remove('sidebar-open');
                    }
                });
            });
        </script>
            <div class="sidebar-logo">
                <img src="{{ asset('logo.png') }}" alt="Logo" style="height: 80px;">
            </div>
            <div class="sidebar-divider"></div>
            <nav class="flex-grow-1 overflow-y-auto py-2">
                <div class="sidebar-section">Main</div>
                <ul class="nav flex-column px-2">
                    <li class="nav-item">
                        <a href="{{ route('admin.dashboard') }}" class="sidebar-link {{ request()->routeIs('admin.dashboard') ? 'active' : '' }}">
                            <i class="bi bi-speedometer2"></i> Dashboard
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.league_sessions.index') }}" class="sidebar-link {{ request()->routeIs('admin.league_sessions.*') ? 'active' : '' }}">
                            <i class="bi bi-calendar2-week"></i> Leagues/Sessions
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.templates.index') }}" class="sidebar-link {{ request()->routeIs('admin.templates.*') ? 'active' : '' }}">
                            <i class="bi bi-bookmark"></i> Saved Templates
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.banners.index') }}" class="sidebar-link {{ request()->routeIs('admin.banners.*') ? 'active' : '' }}">
                            <i class="bi bi-image"></i> Manage Banners
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.market_type_categories.index') }}" class="sidebar-link {{ request()->routeIs('admin.market_type_categories.*') ? 'active' : '' }}">
                            <i class="bi bi-tags"></i> Market Type Category
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.users.index') }}" class="sidebar-link {{ request()->routeIs('admin.users.*') ? 'active' : '' }}">
                            <i class="bi bi-people"></i> Players
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.contests.index') }}" class="sidebar-link {{ request()->routeIs('admin.contests.*') ? 'active' : '' }}">
                            <i class="bi bi-trophy"></i> Contests
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.saved-baskets.index') }}" class="sidebar-link {{ request()->routeIs('admin.saved-baskets.*') ? 'active' : '' }}">
                            <i class="bi bi-wallet2"></i> Portfolios
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.entries.index') }}" class="sidebar-link {{ request()->routeIs('admin.entries.*') ? 'active' : '' }}">
                            <i class="bi bi-list-ul"></i> Entries
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.transactions.index') }}" class="sidebar-link {{ request()->routeIs('admin.transactions.*') ? 'active' : '' }}">
                            <i class="bi bi-arrow-left-right"></i> Transactions
                        </a>
                    </li>
                </ul>
                <div class="sidebar-divider"></div>
                <div class="sidebar-section">Other</div>
                <ul class="nav flex-column px-2">
                    <li class="nav-item">
                        <a href="{{ route('admin.tickets.index') }}" class="sidebar-link {{ request()->routeIs('admin.tickets.*') ? 'active' : '' }}">
                            <i class="bi bi-ticket-detailed"></i> Support Tickets
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.announcements.index') }}" class="sidebar-link {{ request()->routeIs('admin.announcements.*') ? 'active' : '' }}">
                            <i class="bi bi-megaphone"></i> Announcements
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.withdrawal_requests.index') }}" class="sidebar-link {{ request()->routeIs('admin.withdrawal_requests.*') ? 'active' : '' }}">
                            <i class="bi bi-cash-coin"></i> Withdrawal Requests
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.settings.index') }}" class="sidebar-link {{ request()->routeIs('admin.settings.*') ? 'active' : '' }}">
                            <i class="bi bi-gear"></i> Settings
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.live-price-feeds.index') }}" class="sidebar-link {{ request()->routeIs('admin.live-price-feeds.*') ? 'active' : '' }}">
                            <i class="bi bi-graph-up"></i> Live Price Feeds
                        </a>
                    </li>
                </ul>
            </nav>
            <div class="sidebar-divider"></div>
            <div class="px-3 pb-3">
                <form action="{{ route('admin.logout') }}" method="POST" class="w-100">
                    @csrf
                    <button type="submit" class="btn btn-outline-light w-100">
                        <i class="bi bi-box-arrow-right me-2"></i> Logout
                    </button>
                </form>
            </div>
        </div>

    <!-- Main content -->
    <div class="content-wrapper d-flex flex-column" :class="{ 'ms-lg-250': sidebarOpen }" style="min-height: 100vh;">
        <!-- Top navbar -->
        <header class="navbar navbar-expand-lg navbar-light bg-white border-bottom">
            <div class="container-fluid">
                <button @click="sidebarOpen = !sidebarOpen" class="btn btn-link text-dark d-lg-none" type="button">
                    <i class="bi bi-list" style="font-size: 1.5rem;"></i>
                </button>
                <h1 class="h5 mb-0">@yield('title', 'Dashboard')</h1>
                <div class="d-flex align-items-center">
                    <!-- Notifications -->
                    <div class="dropdown ms-3" x-data="{ open: false }">
                        <button @click="open = !open" class="btn btn-link text-dark position-relative" type="button">
                            <i class="bi bi-bell" style="font-size: 1.25rem;"></i>
                            <span class="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle">
                                <span class="visually-hidden">New alerts</span>
                            </span>
                        </button>
                        <div x-show="open" @click.away="open = false" class="dropdown-menu dropdown-menu-end shadow" style="min-width: 300px;">
                            <div class="dropdown-header">
                                <h6 class="mb-0">Notifications</h6>
                            </div>
                            <div class="dropdown-divider"></div>
                            <a href="#" class="dropdown-item">
                                <div class="d-flex align-items-center">
                                    <div class="flex-shrink-0">
                                        <i class="bi bi-person-plus text-primary me-2"></i>
                                    </div>
                                    <div class="flex-grow-1">
                                        <div>New user registered</div>
                                        <small class="text-muted">2 minutes ago</small>
                                    </div>
                                </div>
                            </a>
                            <div class="dropdown-divider"></div>
                            <a href="#" class="dropdown-item text-center">View all notifications</a>
                        </div>
                    </div>
                    
                    <!-- User dropdown -->
                    <div class="dropdown ms-2" x-data="{ open: false }">
                        <button @click="open = !open" class="btn btn-link text-dark text-decoration-none d-flex align-items-center" type="button">
                            <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                                {{ strtoupper(substr(Auth::user()->name, 0, 1)) }}
                            </div>
                            <span class="ms-2 d-none d-md-inline">{{ Auth::user()->name }}</span>
                            <i class="bi bi-chevron-down ms-1"></i>
                        </button>
                        <div x-show="open" @click.away="open = false" class="dropdown-menu dropdown-menu-end shadow">
                            <h6 class="dropdown-header">Welcome, {{ Auth::user()->name }}</h6>
                            <div class="dropdown-divider"></div>
                            <a href="{{ route('admin.profile.show') }}" class="dropdown-item">
                                <i class="bi bi-person me-2"></i> Profile
                            </a>
                            <a href="{{ route('admin.settings.index') }}" class="dropdown-item">
                                <i class="bi bi-gear me-2"></i> Settings
                            </a>
                            <div class="dropdown-divider"></div>
                            <form action="{{ route('admin.logout') }}" method="POST" class="w-100">
                                @csrf
                                <button type="submit" class="dropdown-item">
                                    <i class="bi bi-box-arrow-right me-2"></i> Sign out
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </header>

        <!-- Page content -->
        <main class="flex-grow-1 p-4">
            <!-- Flash messages -->
            @if (session('success'))
                <div class="alert alert-success alert-dismissible fade show mb-4" role="alert">
                    <i class="bi bi-check-circle-fill me-2"></i>
                    {{ session('success') }}
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            @endif

            @if ($errors->any())
                <div class="alert alert-danger alert-dismissible fade show mb-4" role="alert">
                    <div class="d-flex">
                        <i class="bi bi-exclamation-triangle-fill me-2"></i>
                        <div>
                            <h6 class="alert-heading">Whoops! Something went wrong.</h6>
                            <ul class="mb-0 ps-3">
                                @foreach ($errors->all() as $error)
                                    <li>{{ $error }}</li>
                                @endforeach
                            </ul>
                        </div>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            @endif

            <!-- Page content -->
            @yield('content')
        </main>
        
        <!-- Footer -->
        <footer class="bg-light py-3 border-top">
            <div class="container-fluid">
                <div class="text-center text-muted small">
                    &copy; {{ date('Y') }} {{ config('app.name') }}. All rights reserved.
                </div>
            </div>
        </footer>
    </div>

      <!-- Bootstrap 5 JS Bundle with Popper -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <!-- Alpine.js v3 -->
    <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    <style>
        @media (min-width: 992px) {
            .ms-lg-250 {
                margin-left: 250px;
            }
        }
    </style>
<script>
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof generateGroupInputs === 'function') {
      generateGroupInputs();
      calculateAndDistribute();
    }
  });

  // Attach input listeners
    ['winningPercentage','participants']
        .forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => {
                    generateGroupInputs();
                    calculateAndDistribute();
                });
            }
        });

  ['entryFee','platformFee']
    .forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('input', calculateAndDistribute);
      }
    });

    // Predefined prize distribution table
   const prizeDistributionTable = {
    10: [
        {start: 1, end: 1, percent: 30},
        {start: 2, end: 2, percent: 18},
        {start: 3, end: 3, percent: 11},
        {start: 4, end: 5, percent: 13.5},
        {start: 6, end: 10, percent: 27.5}
    ],
    25: [
        {start: 1, end: 1, percent: 24},
        {start: 2, end: 2, percent: 14},
        {start: 3, end: 3, percent: 9},
        {start: 4, end: 5, percent: 12.375},
        {start: 6, end: 10, percent: 18.125},
        {start: 11, end: 25, percent: 22.5}
    ],
    50: [
        {start: 1, end: 1, percent: 23},
        {start: 2, end: 2, percent: 13},
        {start: 3, end: 3, percent: 9},
        {start: 4, end: 5, percent: 8.1},
        {start: 6, end: 10, percent: 15},
        {start: 11, end: 25, percent: 16.4},
        {start: 26, end: 50, percent: 15.5}
    ],
    100: [
        {start: 1, end: 1, percent: 18},
        {start: 2, end: 2, percent: 10},
        {start: 3, end: 3, percent: 8},
        {start: 4, end: 5, percent: 6.576},
        {start: 6, end: 10, percent: 10},
        {start: 11, end: 25, percent: 15.4},
        {start: 26, end: 50, percent: 16.524},
        {start: 51, end: 100, percent: 15.5}
    ],
    250: [
        {start: 1, end: 1, percent: 14},
        {start: 2, end: 2, percent: 9},
        {start: 3, end: 3, percent: 7},
        {start: 4, end: 5, percent: 5.169},
        {start: 6, end: 10, percent: 8.602},
        {start: 11, end: 25, percent: 13.323},
        {start: 26, end: 50, percent: 13.031},
        {start: 51, end: 100, percent: 13.375},
        {start: 101, end: 250, percent: 16.5}
    ],
    500: [
        {start: 1, end: 1, percent: 14},
        {start: 2, end: 2, percent: 9},
        {start: 3, end: 3, percent: 7},
        {start: 4, end: 5, percent: 3.1},
        {start: 6, end: 10, percent: 6.628},
        {start: 11, end: 25, percent: 10.576},
        {start: 26, end: 50, percent: 10.102},
        {start: 51, end: 100, percent: 12.469},
        {start: 101, end: 250, percent: 13.625},
        {start: 251, end: 500, percent: 13.5}
    ],
    1000: [
        {start: 1, end: 1, percent: 12},
        {start: 2, end: 2, percent: 8},
        {start: 3, end: 3, percent: 5},
        {start: 4, end: 5, percent: 2.399},
        {start: 6, end: 10, percent: 4.931},
        {start: 11, end: 25, percent: 9.11},
        {start: 26, end: 50, percent: 8.813},
        {start: 51, end: 100, percent: 10.418},
        {start: 101, end: 250, percent: 11.891},
        {start: 251, end: 500, percent: 12.188},
        {start: 501, end: 1000, percent: 15.25}
    ],
    2500: [
        {start: 1, end: 1, percent: 10},
        {start: 2, end: 2, percent: 7},
        {start: 3, end: 3, percent: 5},
        {start: 4, end: 5, percent: 1.8},
        {start: 6, end: 10, percent: 3.5},
        {start: 11, end: 25, percent: 7.386},
        {start: 26, end: 50, percent: 7.229},
        {start: 51, end: 100, percent: 8.972},
        {start: 101, end: 250, percent: 10.629},
        {start: 251, end: 500, percent: 11.172},
        {start: 501, end: 1000, percent: 12.562},
        {start: 1001, end: 2500, percent: 14.75}
    ],
    5000: [
        {start: 1, end: 1, percent: 10},
        {start: 2, end: 2, percent: 7},
        {start: 3, end: 3, percent: 5},
        {start: 4, end: 5, percent: 1.75},
        {start: 6, end: 10, percent: 3},
        {start: 11, end: 25, percent: 5.314},
        {start: 26, end: 50, percent: 5.355},
        {start: 51, end: 100, percent: 7.14},
        {start: 101, end: 250, percent: 8.853},
        {start: 251, end: 500, percent: 9.471},
        {start: 501, end: 1000, percent: 10.961},
        {start: 1001, end: 2500, percent: 12.281},
        {start: 2501, end: 5000, percent: 13.875}
    ],
    10000: [
        {start: 1, end: 1, percent: 10},
        {start: 2, end: 2, percent: 7},
        {start: 3, end: 3, percent: 5},
        {start: 4, end: 5, percent: 1.6},
        {start: 6, end: 10, percent: 2.049},
        {start: 11, end: 25, percent: 4.283},
        {start: 26, end: 50, percent: 4.31},
        {start: 51, end: 100, percent: 5.08},
        {start: 101, end: 500, percent: 8.774},
        {start: 501, end: 1000, percent: 10.365},
        {start: 1001, end: 2500, percent: 12.82},
        {start: 2501, end: 5000, percent: 12.094},
        {start: 5001, end: 10000, percent: 16.625}
    ],
    25000: [
        {start: 1, end: 1, percent: 8},
        {start: 2, end: 2, percent: 6},
        {start: 3, end: 3, percent: 4.5},
        {start: 4, end: 5, percent: 1.4},
        {start: 6, end: 10, percent: 1.7},
        {start: 11, end: 25, percent: 3.164},
        {start: 26, end: 50, percent: 3.422},
        {start: 51, end: 100, percent: 4.229},
        {start: 101, end: 500, percent: 6.262},
        {start: 501, end: 1000, percent: 7.339},
        {start: 1001, end: 5000, percent: 12.172},
        {start: 5001, end: 10000, percent: 12.562},
        {start: 10001, end: 25000, percent: 29.25}
    ],
    50000: [
        {start: 1, end: 1, percent: 8},
        {start: 2, end: 2, percent: 6},
        {start: 3, end: 3, percent: 4.5},
        {start: 4, end: 5, percent: 1.2},
        {start: 6, end: 10, percent: 1.7},
        {start: 11, end: 25, percent: 2.903},
        {start: 26, end: 50, percent: 3.043},
        {start: 51, end: 100, percent: 3.89},
        {start: 101, end: 500, percent: 6.187},
        {start: 501, end: 1000, percent: 6.916},
        {start: 1001, end: 5000, percent: 8.555},
        {start: 5001, end: 10000, percent: 10},
        {start: 10001, end: 25000, percent: 17.431},
        {start: 25001, end: 50000, percent: 19.675}
    ],
    100000: [
        {start: 1, end: 1, percent: 8},
        {start: 2, end: 2, percent: 6},
        {start: 3, end: 3, percent: 4.5},
        {start: 4, end: 5, percent: 1.052},
        {start: 6, end: 10, percent: 1.502},
        {start: 11, end: 25, percent: 2.737},
        {start: 26, end: 50, percent: 2.65},
        {start: 51, end: 100, percent: 3.533},
        {start: 101, end: 500, percent: 5.377},
        {start: 501, end: 1000, percent: 5.1},
        {start: 1001, end: 5000, percent: 7.893},
        {start: 5001, end: 10000, percent: 8.45},
        {start: 10001, end: 25000, percent: 11.031},
        {start: 25001, end: 50000, percent: 12.375},
        {start: 50001, end: 100000, percent: 19.8}
    ],
    250000: [
        {start: 1, end: 1, percent: 6.5},
        {start: 2, end: 2, percent: 5},
        {start: 3, end: 3, percent: 4},
        {start: 4, end: 5, percent: 1.076},
        {start: 6, end: 10, percent: 1.8},
        {start: 11, end: 25, percent: 2.53},
        {start: 26, end: 50, percent: 2.507},
        {start: 51, end: 100, percent: 3.11},
        {start: 101, end: 500, percent: 5},
        {start: 501, end: 1000, percent: 6},
        {start: 1001, end: 5000, percent: 7.075},
        {start: 5001, end: 10000, percent: 7.766},
        {start: 10001, end: 25000, percent: 8.355},
        {start: 25001, end: 100000, percent: 13.281},
        {start: 100001, end: 250000, percent: 26}
    ],
    500000: [
        {start: 1, end: 1, percent: 6.5},
        {start: 2, end: 2, percent: 5},
        {start: 3, end: 3, percent: 4},
        {start: 4, end: 5, percent: 1.005},
        {start: 6, end: 10, percent: 1.673},
        {start: 11, end: 25, percent: 2.831},
        {start: 26, end: 50, percent: 2.375},
        {start: 51, end: 100, percent: 2.9},
        {start: 101, end: 500, percent: 4.6},
        {start: 501, end: 1000, percent: 5.6},
        {start: 1001, end: 5000, percent: 6.788},
        {start: 5001, end: 10000, percent: 7.532},
        {start: 10001, end: 25000, percent: 7.734},
        {start: 25001, end: 100000, percent: 9.312},
        {start: 100001, end: 250000, percent: 12.75},
        {start: 250001, end: 500000, percent: 19.4}
    ],
    1000000: [
        {start: 1, end: 1, percent: 5.5},
        {start: 2, end: 2, percent: 4.2},
        {start: 3, end: 3, percent: 3.5},
        {start: 4, end: 5, percent: 0.941},
        {start: 6, end: 10, percent: 1.621},
        {start: 11, end: 25, percent: 2.194},
        {start: 26, end: 50, percent: 2.159},
        {start: 51, end: 100, percent: 2.812},
        {start: 101, end: 500, percent: 4.538},
        {start: 501, end: 1000, percent: 5.2},
        {start: 1001, end: 5000, percent: 6.555},
        {start: 5001, end: 10000, percent: 7.407},
        {start: 10001, end: 25000, percent: 7.709},
        {start: 25001, end: 100000, percent: 8.945},
        {start: 100001, end: 250000, percent: 11.594},
        {start: 250001, end: 500000, percent: 13.125},
        {start: 500001, end: 1000000, percent: 12}
    ],
    2500000: [
        {start: 1, end: 1, percent: 5.5},
        {start: 2, end: 2, percent: 4.2},
        {start: 3, end: 3, percent: 3.5},
        {start: 4, end: 5, percent: 0.854},
        {start: 6, end: 10, percent: 1.301},
        {start: 11, end: 25, percent: 2.018},
        {start: 26, end: 50, percent: 1.991},
        {start: 51, end: 100, percent: 2.655},
        {start: 101, end: 500, percent: 3.807},
        {start: 501, end: 1000, percent: 3.742},
        {start: 1001, end: 5000, percent: 5.656},
        {start: 5001, end: 10000, percent: 6.542},
        {start: 10001, end: 25000, percent: 7.389},
        {start: 25001, end: 100000, percent: 8.185},
        {start: 100001, end: 250000, percent: 8.914},
        {start: 250001, end: 500000, percent: 9.552},
        {start: 500001, end: 1000000, percent: 11.069},
        {start: 1000001, end: 2500000, percent: 13.125}
    ],
    5000000: [
        {start: 1, end: 1, percent: 5.5},
        {start: 2, end: 2, percent: 4.2},
        {start: 3, end: 3, percent: 3.5},
        {start: 4, end: 5, percent: 0.765},
        {start: 6, end: 10, percent: 1.147},
        {start: 11, end: 25, percent: 1.737},
        {start: 26, end: 50, percent: 1.716},
        {start: 51, end: 100, percent: 1.888},
        {start: 101, end: 500, percent: 2.851},
        {start: 501, end: 1000, percent: 2.801},
        {start: 1001, end: 5000, percent: 4.735},
        {start: 5001, end: 10000, percent: 4.646},
        {start: 10001, end: 25000, percent: 6.528},
        {start: 25001, end: 100000, percent: 7.371},
        {start: 100001, end: 250000, percent: 8.162},
        {start: 250001, end: 500000, percent: 8.882},
        {start: 500001, end: 1000000, percent: 10.509},
        {start: 1000001, end: 2500000, percent: 11.012},
        {start: 2500001, end: 5000000, percent: 12.05}
    ]
};


            function getClosestWinnerCount(n) {
                // Find nearest lower and higher structure
                const keys = Object.keys(prizeDistributionTable).map(Number).sort((a,b)=>a-b);
                let lower = keys[0], higher = keys[keys.length-1];
                for (let k of keys) {
                    if (k <= n) lower = k;
                    if (k >= n && higher === keys[keys.length-1]) higher = k;
                }
                // If exact match
                if (n === lower) return lower;
                // If both are same distance, prefer higher
                if ((n-lower) === (higher-n)) return higher;
                // Otherwise, pick closer
                return (n-lower) < (higher-n) ? lower : higher;
            }

            function getAdjustedPrizeGroups(actualWinners, groups, chosenStructure, isHigher) {
                // If higher structure chosen, cut last group
                // If lower structure chosen, extend last group
                let adjusted = [];
                for (let i = 0; i < groups.length; i++) {
                    let g = {...groups[i]};
                    // Last group logic
                    if (i === groups.length - 1) {
                        if (isHigher) {
                            // Cut last group to actualWinners
                            if (g.start > actualWinners) continue;
                            g.end = Math.min(g.end, actualWinners);
                        } else {
                            // Extend last group to actualWinners
                            if (g.start > actualWinners) continue;
                            g.end = actualWinners;
                        }
                    } else {
                        // For other groups, cut if needed
                        if (g.start > actualWinners) continue;
                        if (g.end > actualWinners) g.end = actualWinners;
                    }
                    adjusted.push(g);
                }
                return adjusted;
            }

            function generateGroupInputs() {
                const participantsEl = document.getElementById('participants');
                const winningPercentageEl = document.getElementById('winningPercentage');
                const totalWinnersSpan = document.getElementById('totalWinnersCount');
                const container = document.getElementById('prizeDistributionInputs');
                
                if (!participantsEl || !winningPercentageEl || !totalWinnersSpan || !container) return;
                
                const participants = parseFloat(participantsEl.value);
                const winningPercent = parseFloat(winningPercentageEl.value);
                container.innerHTML = '';

                if (isNaN(participants) || participants <= 0 || isNaN(winningPercent) || winningPercent <= 0) {
                    totalWinnersSpan.textContent = 'N/A';
                    return;
                }

                const totalWinners = Math.round(participants * (winningPercent / 100));
                totalWinnersSpan.textContent = totalWinners;

                if (totalWinners <= 2) {
                    container.innerHTML = '<p>Winners are 2 or less. No groups will be formed.</p>';
                    return;
                }

                // Use nearest structure and adjust last group
                const availableStructures = Object.keys(prizeDistributionTable).map(Number).sort((a,b)=>a-b);
                const lower = availableStructures.filter(s => s <= totalWinners).pop() || availableStructures[0];
                const higher = availableStructures.find(s => s >= totalWinners) || availableStructures[availableStructures.length-1];
                const chosenStructure = getClosestWinnerCount(totalWinners);
                const isHigher = chosenStructure === higher;
                const groups = prizeDistributionTable[chosenStructure];
                if (!groups) {
                    container.innerHTML = '<p>No predefined distribution for this winner count.</p>';
                    return;
                }
                const adjustedGroups = getAdjustedPrizeGroups(totalWinners, groups, chosenStructure, isHigher);
                adjustedGroups.forEach((g, i) => {
                    const div = document.createElement('div');
                    div.className = 'prize-distribution-input';
                    div.innerHTML = `
                        <label for="group${i}Percent">Ranks ${g.start}-${g.end}</label>
                        <input type="number" id="group${i}Percent" 
                                     class="group-percent-input" 
                                     value="${g.percent}" 
                                     min="0" max="100" step="any">
                        <span>%</span>
                    `;
                    container.appendChild(div);
                });
            }

            function calculateAndDistribute() {
                const participantsEl = document.getElementById('participants');
                const entryFeeEl = document.getElementById('entryFee');
                const platformFeeEl = document.getElementById('platformFee');
                const totalWinnersEl = document.getElementById('totalWinnersCount');
                const resultEl = document.getElementById('result');
                
                if (!participantsEl || !entryFeeEl || !platformFeeEl || !totalWinnersEl || !resultEl) return;
                
                const N = parseFloat(participantsEl.value);
                const E = parseFloat(entryFeeEl.value);
                const F = parseFloat(platformFeeEl.value);
                const totalWinners = parseFloat(totalWinnersEl.textContent);

                if (isNaN(N) || isNaN(E) || isNaN(F)) {
                    resultEl.textContent = 'Please enter a valid number for all fields.';
                    return;
                }

                const totalPrizePool = N * E * (1 - (F / 100));
                resultEl.textContent = `Total Prize Pool: ₹${totalPrizePool.toFixed(2)}`;

                const distributionResult = document.getElementById('distributionResult');
                if (!distributionResult) return;
                distributionResult.innerHTML = '';

                let totalPercent = 0;
                const groupPercentInputs = document.querySelectorAll('.group-percent-input');
                groupPercentInputs.forEach((input) => {
                    const percent = parseFloat(input.value);
                    if (!isNaN(percent) && percent > 0) totalPercent += percent;
                });

                const warningElement = document.getElementById('totalPercentageWarning');
                if (warningElement) {
                    if (totalPercent > 100.01) {
                        warningElement.textContent = `Error: Total percentage is over 100% (${totalPercent.toFixed(2)}%)`;
                        return;
                    } else {
                        warningElement.textContent = '';
                    }
                }

                // Use nearest structure and adjust last group
                const availableStructures = Object.keys(prizeDistributionTable).map(Number).sort((a,b)=>a-b);
                const lower = availableStructures.filter(s => s <= totalWinners).pop() || availableStructures[0];
                const higher = availableStructures.find(s => s >= totalWinners) || availableStructures[availableStructures.length-1];
                const chosenStructure = getClosestWinnerCount(totalWinners);
                const isHigher = chosenStructure === higher;
                const groups = prizeDistributionTable[chosenStructure];
                const adjustedGroups = getAdjustedPrizeGroups(totalWinners, groups, chosenStructure, isHigher);

                // Prepare prize distribution JSON
                let distribution = [];
                groupPercentInputs.forEach((input, i) => {
                    const percent = parseFloat(input.value);
                    if (!isNaN(percent) && percent > 0) {
                        const group = adjustedGroups[i];
                        const groupPrize = totalPrizePool * (percent / 100);
                        const numInGroup = group.end - group.start + 1;
                        const perPersonPrize = groupPrize / numInGroup;
                        distribution.push({
                            label: `Ranks ${group.start}-${group.end}`,
                            prize: groupPrize,
                            winners: numInGroup,
                            perWinner: perPersonPrize,
                            percent: percent
                        });
                    }
                });

                // Update hidden input value
                const prizeInput = document.getElementById('prize_distribution_hidden');
                if (prizeInput) {
                    prizeInput.value = JSON.stringify(distribution);
                }

                // Optional: show alert for debugging
                // alert(prizeInput.value);
            }
</script>

</body>
</html>