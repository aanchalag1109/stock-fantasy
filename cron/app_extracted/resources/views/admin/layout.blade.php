<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin - @yield('title')</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen flex">

    {{-- Sidebar --}}
    <aside class="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
        <div class="px-6 py-5 text-xl font-bold border-b border-gray-700">⚙ Admin Panel</div>
        <nav class="flex-1 px-4 py-4 space-y-1">
            <a href="{{ route('admin.dashboard') }}"
               class="flex items-center gap-2 px-3 py-2 rounded text-sm {{ request()->routeIs('admin.dashboard') ? 'bg-blue-600' : 'hover:bg-gray-700' }}">
                🏠 Dashboard
            </a>
            <a href="{{ route('admin.cron.index') }}"
               class="flex items-center gap-2 px-3 py-2 rounded text-sm {{ request()->routeIs('admin.cron.*') ? 'bg-blue-600' : 'hover:bg-gray-700' }}">
                🕐 Cron Jobs
            </a>
        </nav>
        @auth
        <div class="px-4 py-4 border-t border-gray-700">
            <p class="text-xs text-gray-400 mb-2">{{ Auth::user()->name }}</p>
            <form method="POST" action="{{ route('admin.logout') }}">
                @csrf
                <button class="w-full text-left text-sm text-red-400 hover:text-red-300">→ Logout</button>
            </form>
        </div>
        @endauth
    </aside>

    {{-- Main --}}
    <div class="flex-1 flex flex-col">
        <header class="bg-white shadow px-6 py-4">
            <h1 class="text-lg font-semibold text-gray-700">@yield('title')</h1>
        </header>
        <main class="p-6 flex-1">
            @if(session('success'))
                <div class="bg-green-100 text-green-700 px-4 py-3 rounded mb-4 text-sm">
                    {{ session('success') }}
                </div>
            @endif
            @yield('content')
        </main>
    </div>

</body>
</html>
