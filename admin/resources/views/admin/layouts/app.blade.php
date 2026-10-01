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
<body class="bg-light">
    <div x-data="{ sidebarOpen: window.innerWidth >= 992, dropdownOpen: false, notificationOpen: false }" x-init="window.addEventListener('resize', () => { sidebarOpen = window.innerWidth >= 992; })">
    <!-- Mobile sidebar backdrop -->
    <div x-show="sidebarOpen && window.innerWidth < 992" @click="sidebarOpen = false" class="position-fixed w-100 bg-dark opacity-50" style="z-index: 3000; top:56px; height:calc(100vh - 56px);" x-cloak></div>

    <!-- Sidebar -->
    <div class="sidebar text-white d-flex flex-column d-lg-block" :class="{ 'open': sidebarOpen, 'd-none': !sidebarOpen && window.innerWidth < 992 }" style="width: 250px; z-index: 1040;">
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
                        <a href="{{ route('admin.performance.index') }}" class="sidebar-link {{ request()->routeIs('admin.performance.*') ? 'active' : '' }}">
                            <i class="bi bi-graph-up-arrow"></i> Performance
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.contest-analysis.index') }}" class="sidebar-link {{ request()->routeIs('admin.contest-analysis.*') ? 'active' : '' }}">
                            <i class="bi bi-bar-chart-line"></i> Contest Analysis
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.announcements.index') }}" class="sidebar-link {{ request()->routeIs('admin.announcements.*') ? 'active' : '' }}">
                            <i class="bi bi-megaphone"></i> Announcements
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
                        <a href="{{ route('admin.live-management') }}" class="sidebar-link {{ request()->routeIs('admin.live-management') ? 'active' : '' }}">
                            <i class="bi bi-broadcast-pin"></i> Live Management
                            <span class="badge bg-danger ms-auto" id="liveContestCount">0</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.cron-logs.index') }}" class="sidebar-link {{ request()->routeIs('admin.cron-logs.*') ? 'active' : '' }}">
                            <i class="bi bi-clock-history"></i> Cron Check
                        </a>
                    </li>
                    {{-- <li class="nav-item">
                        <a href="{{ route('admin.entries.index') }}" class="sidebar-link {{ request()->routeIs('admin.entries.*') ? 'active' : '' }}">
                            <i class="bi bi-list-ul"></i> Entries
                        </a>
                    </li> --}}
                    <li class="nav-item">
                        <a href="{{ route('admin.transactions.index') }}" class="sidebar-link {{ request()->routeIs('admin.transactions.*') ? 'active' : '' }}">
                            <i class="bi bi-arrow-left-right"></i> Transactions
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.pending-prizes.index') }}" class="sidebar-link {{ request()->routeIs('admin.pending-prizes.*') ? 'active' : '' }}">
                            <i class="bi bi-trophy text-warning"></i> Pending Prizes
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.payments.index') }}" class="sidebar-link {{ request()->routeIs('admin.payments.*') ? 'active' : '' }}">
                            <i class="bi bi-credit-card"></i> Payment Orders
                        </a>
                    </li>
                </ul>
                <div class="sidebar-divider"></div>
                <div class="sidebar-section">Other</div>
                <ul class="nav flex-column px-2">
                    <li class="nav-item">
                        <a href="{{ route('admin.banners.index') }}" class="sidebar-link {{ request()->routeIs('admin.banners.*') ? 'active' : '' }}">
                            <i class="bi bi-image"></i> Manage Banners
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.withdrawal_requests.index') }}" class="sidebar-link {{ request()->routeIs('admin.withdrawal_requests.*') ? 'active' : '' }}">
                            <i class="bi bi-cash-coin"></i> Withdrawal Requests
                        </a>
                    </li>

                    <li class="nav-item">
                        <a href="{{ route('admin.live-price-feeds.index') }}" class="sidebar-link {{ request()->routeIs('admin.live-price-feeds.*') ? 'active' : '' }}">
                            <i class="bi bi-graph-up"></i> Live Price Feeds
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.testing.test-users') }}" class="sidebar-link {{ request()->routeIs('admin.testing.*') ? 'active' : '' }}">
                            <i class="bi bi-bug"></i> Test Users
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="{{ route('admin.testing.index') }}" class="sidebar-link {{ request()->routeIs('admin.testing.*') ? 'active' : '' }}">
                            <i class="bi bi-bug"></i> Testing
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

            @if (session('warning'))
                <div class="alert alert-warning alert-dismissible fade show mb-4" role="alert">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    {{ session('warning') }}
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            @endif

            @if (session('error'))
                <div class="alert alert-danger alert-dismissible fade show mb-4" role="alert">
                    <i class="bi bi-x-circle-fill me-2"></i>
                    {{ session('error') }}
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
    </div> <!-- Close Alpine.js wrapper -->


      <!-- Bootstrap 5 JS Bundle with Popper -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <!-- jQuery -->
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <!-- Alpine.js v3 -->
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
   
    <style>
        @media (min-width: 992px) {
            .ms-lg-250 {
                margin-left: 250px;
            }
        }
    </style>
 @yield('scripts')
</body>
<script>
// Live Contest Counter
function updateLiveContestCount() {
    fetch('{{ url("/api/live-contests-count") }}')
        .then(response => response.json())
        .then(data => {
            const badge = document.getElementById('liveContestCount');
            if (badge) {
                badge.textContent = data.count || 0;
                badge.style.display = data.count > 0 ? 'inline' : 'none';
            }
        })
        .catch(error => console.log('Live contest count update failed'));
}

// Update count every 30 seconds
setInterval(updateLiveContestCount, 30000);
// Initial load
document.addEventListener('DOMContentLoaded', updateLiveContestCount);
</script>


</html>