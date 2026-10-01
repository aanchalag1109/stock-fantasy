@extends('admin.layout')
@section('title', 'Edit Cron Job')

@section('content')
<div class="max-w-2xl bg-white rounded-lg shadow p-6">
    @if($errors->any())
        <div class="bg-red-100 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            <ul class="list-disc list-inside">@foreach($errors->all() as $e)<li>{{ $e }}</li>@endforeach</ul>
        </div>
    @endif

    <form method="POST" action="{{ route('admin.cron.update', $cron) }}">
        @csrf @method('PUT')
        @include('admin.cron._form', ['cron' => $cron])
        <div class="flex gap-3 mt-6">
            <button type="submit" class="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 text-sm">Update</button>
            <a href="{{ route('admin.cron.index') }}" class="px-5 py-2 rounded border text-sm hover:bg-gray-50">Cancel</a>
        </div>
    </form>
</div>
@endsection
