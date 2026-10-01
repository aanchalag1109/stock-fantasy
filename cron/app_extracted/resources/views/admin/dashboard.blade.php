@extends('admin.layout')
@section('title', 'Dashboard')

@section('content')
<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-500">Welcome back</p>
        <p class="text-2xl font-bold text-gray-800 mt-1">{{ Auth::user()->name }}</p>
    </div>
    <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-500">Email</p>
        <p class="text-lg font-medium text-gray-800 mt-1">{{ Auth::user()->email }}</p>
    </div>
    <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-500">Total Cron Jobs</p>
        <p class="text-2xl font-bold text-gray-800 mt-1">{{ \App\Models\CronJob::count() }}</p>
    </div>
</div>
@endsection
