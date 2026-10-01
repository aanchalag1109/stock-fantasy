@extends('admin.layouts.app')

@section('title', 'Manage Users')

@section('content')
<div class="container-fluid">
    <!-- Page Header -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-2 text-gray-800">User Management</h1>
            <p class="mb-0">Manage all registered users and their permissions</p>
        </div>
        <div>
            <a href="{{ route('admin.users.create') }}" class="btn btn-primary">
                <i class="bi bi-plus-lg me-2"></i> Add New User
            </a>
        </div>
    </div>

    <!-- Search and Filter Card -->
    <div class="card shadow-sm mb-4">
        <div class="card-body">
            <form action="{{ route('admin.users.index') }}" method="GET" class="row g-3">
                <div class="col-md-4">
                    <label for="search" class="form-label">Search</label>
                    <div class="input-group">
                        <span class="input-group-text"><i class="bi bi-search"></i></span>
                        <input type="text" class="form-control" id="search" name="search" 
                               placeholder="Search by name or email..." value="{{ request('search') }}">
                    </div>
                </div>
                <div class="col-md-3">
                    <label for="kyc_status" class="form-label">KYC Status</label>
                    <select class="form-select" id="kyc_status" name="kyc_status">
                            <option value="">All Statuses</option>
            </div>
            </div>
            <!-- User List -->
            <div class="card mb-4">
                <div class="card-header fw-bold">Users</div>
                <div class="list-group list-group-flush">




                    @forelse($users as $user) 
                        <a href="{{ route('admin.users.show', $user->id) }}" class="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3" style="border:none;">
                            <span class="avatar" style="width:28px;height:28px;background:#1677ff;color:#fff;font-weight:bold;display:inline-flex;align-items:center;justify-content:center;">{{ substr($user->name, 0, 1) }}</span>
                            <div class="flex-grow-1">
                                <div class="fw-semibold">{{ $user->name }}</div>
                                <div class="text-muted small">ID: {{ $user->id }}</div>
                            </div>
                        </a>
                    @empty
                        <div class="text-center py-5">
                            <span class="avatar" style="width:32px;height:32px;background:#1677ff;color:#fff;font-weight:bold;display:inline-flex;align-items:center;justify-content:center;"><i class="bi bi-person fs-5"></i></span>
                            <h5 class="mb-2">No users found</h5>
                            <p class="text-muted mb-3">No users have been registered yet</p>
                            <a href="{{ route('admin.users.index') }}" class="btn btn-sm btn-primary mt-3">
                                <i class="bi bi-arrow-clockwise me-1"></i> Refresh
                            </a>
                        </div>
                    @endforelse
                </div>
            </div>

            <!-- No pagination controls needed for full user list -->
        </div>
    </div>
</div>
@endsection

@push('scripts')
<script>
    // Auto-submit filter form when dropdowns change
    document.addEventListener('DOMContentLoaded', function() {
        const filterForm = document.querySelector('form[method="GET"]');
        const filterSelects = filterForm.querySelectorAll('select');
        
        filterSelects.forEach(select => {
            select.addEventListener('change', function() {
                filterForm.submit();
            });
        });
    });
</script>
@endpush