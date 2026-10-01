@extends('admin.layouts.app')

@section('title', 'Contest Detail')

@section('head')
<link rel="stylesheet" href="https://cdn.datatables.net/1.13.6/css/dataTables.bootstrap5.min.css">
@endsection

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3">Contest Detail</h1>
            <p class="text-muted mb-0">{{ $contest->leagueSession->name ?? 'N/A' }}</p>
        </div>
        <div>
            <a href="{{ route('admin.testing.create-basket', ['contest' => $contest->id, 'session' => $contest->league_session_id]) }}" class="btn btn-success me-2">
                <i class="bi bi-plus-circle me-2"></i>Create Basket
            </a>
            <a href="{{ route('admin.testing.session-contests', $contest->league_session_id) }}" class="btn btn-outline-secondary">
                <i class="bi bi-arrow-left me-2"></i>Back to Contests
            </a>
        </div>
    </div>

    <!-- Contest Info -->
    <div class="row mb-4">
        <div class="col-md-12">
            <div class="card shadow-sm">
                <div class="card-header fw-bold bg-primary text-white">
                    <i class="bi bi-trophy me-2"></i>Contest Information
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-3">
                            <strong>Contest ID:</strong> {{ $contest->id }}
                        </div>
                        <div class="col-md-3">
                            <strong>Category:</strong> {{ ucfirst($contest->category) }}
                        </div>
                        <div class="col-md-3">
                            <strong>Entry Fee:</strong> ₹{{ number_format($contest->entry_fee, 2) }}
                        </div>
                        <div class="col-md-3">
                            <strong>Participants:</strong> {{ $contest->participants }}
                        </div>
                    </div>
                    <div class="row mt-3">
                        <div class="col-md-3">
                            <strong>Prize Pool:</strong> ₹{{ number_format($contest->prize_pool ?? 0, 2) }}
                        </div>
                        <div class="col-md-3">
                            <strong>Status:</strong> 
                            <span class="badge bg-{{ $contest->status == 'live' ? 'success' : ($contest->status == 'upcoming' ? 'info' : 'secondary') }}">
                                {{ ucfirst($contest->status) }}
                            </span>
                        </div>
                        <div class="col-md-3">
                            <strong>Entries:</strong> {{ $entries->count() }}
                        </div>
                        <div class="col-md-3">
                            <strong>Created:</strong> {{ $contest->created_at->format('d M Y, h:i A') }}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Contest Entries -->
    <div class="row mb-4">
        <div class="col-12">
            <div class="card shadow-sm">
                <div class="card-header fw-bold">
                    <i class="bi bi-people me-2"></i>Contest Entries ({{ $entries->count() }})
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table align-middle mb-0" id="entriesTable">
                            <thead>
                                <tr>
                                    <th>Entry ID</th>
                                    <th>User</th>
                                    <th>Mobile</th>
                                    <th>Basket ID</th>
                                    <th>Serial No</th>
                                    <th>Assets</th>
                                    <th>Basket Owner</th>
                                    <th>Score</th>
                                    <th>Rank</th>
                                    <th>Joined At</th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse($entries as $entry)
                                <tr>
                                    <td>{{ $entry->id }}</td>
                                    <td>{{ $entry->user_name }} <small class="text-muted">({{ $entry->mobile }})</small></td>
                                    <td>{{ $entry->mobile }}</td>
                                    <td>{{ $entry->basket_id }}</td>
                                    <td><span class="badge bg-secondary">{{ $entry->serial_no ?? 'N/A' }}</span></td>
                                    <td>
                                        @php
                                            $assets = json_decode($entry->assets, true) ?? [];
                                            $assetNames = array_column($assets, 'name');
                                        @endphp
                                        <small>{{ implode(', ', array_slice($assetNames, 0, 3)) }}{{ count($assetNames) > 3 ? '...' : '' }}</small>
                                    </td>
                                    <td>{{ $entry->basket_owner ?? '-' }}</td>
                                    <td>{{ number_format($entry->total_score ?? 0, 2) }}</td>
                                    <td>{{ $entry->rank ?? '-' }}</td>
                                    <td>{{ \Carbon\Carbon::parse($entry->created_at)->format('d M Y, h:i A') }}</td>
                                </tr>
                                @empty
                                <tr>
                                    <td colspan="10" class="text-center text-muted py-4">No entries found for this contest.</td>
                                </tr>
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Available Test Users -->
    <div class="row mb-4">
        <div class="col-md-6">
            <div class="card shadow-sm">
                <div class="card-header fw-bold bg-warning text-dark d-flex justify-content-between align-items-center">
                    <span><i class="bi bi-people me-2"></i>Available Test Users ({{ $availableUsers->count() }})</span>
                    <div>
                        <input type="number" id="selectCount" class="form-control form-control-sm d-inline-block" style="width: 80px;" placeholder="Count" min="1" max="{{ $availableUsers->count() }}">
                        <button class="btn btn-sm btn-primary" onclick="selectByCount()">
                            <i class="bi bi-check-square me-1"></i>Select
                        </button>
                        <button class="btn btn-sm btn-success me-2" onclick="joinContestForSelected()" id="joinContestBtn" disabled>
                            <i class="bi bi-box-arrow-in-right me-1"></i>Join Contest
                        </button>
                        <button class="btn btn-sm btn-dark" onclick="createBasketsForSelected()" id="createBasketsBtn" disabled>
                            <i class="bi bi-plus-circle me-1"></i>Create Baskets
                        </button>
                    </div>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                        <table class="table table-sm align-middle mb-0">
                            <thead>
                                <tr>
                                    <th><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"></th>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Mobile</th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse($availableUsers as $user)
                                <tr>
                                    <td><input type="checkbox" class="user-checkbox" value="{{ $user->id }}" onchange="updateCreateButton()"></td>
                                    <td>{{ $user->id }}</td>
                                    <td>{{ $user->name }}</td>
                                    <td>{{ $user->mobile }}</td>
                                </tr>
                                @empty
                                <tr>
                                    <td colspan="4" class="text-center text-muted py-3">No available test users.</td>
                                </tr>
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Available Baskets -->
        <div class="col-md-6">
            <div class="card shadow-sm">
                <div class="card-header fw-bold bg-info text-white">
                    <i class="bi bi-basket me-2"></i>Available Baskets ({{ $availableBaskets->count() }})
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                        <table class="table table-sm align-middle mb-0">
                            <thead>
                                <tr>
                                    <th>Basket ID</th>
                                    <th>User</th>
                                    <th>Serial No</th>
                                    <th>Assets</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse($availableBaskets as $basket)
                                <tr>
                                    <td>{{ $basket->id }}</td>
                                    <td>{{ $basket->user_name }}</td>
                                    <td><span class="badge bg-secondary">{{ $basket->serial_no ?? 'N/A' }}</span></td>
                                    <td>
                                        @php
                                            $assets = json_decode($basket->assets, true) ?? [];
                                            $assetNames = array_column($assets, 'name');
                                        @endphp
                                        <small>{{ implode(', ', array_slice($assetNames, 0, 3)) }}{{ count($assetNames) > 3 ? '...' : '' }}</small>
                                    </td>
                                    <td><small>{{ \Carbon\Carbon::parse($basket->created_at)->format('d M, h:i A') }}</small></td>
                                </tr>
                                @empty
                                <tr>
                                    <td colspan="5" class="text-center text-muted py-3">No available baskets.</td>
                                </tr>
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

@endsection

@section('scripts')
<script src="https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js"></script>
<script src="https://cdn.datatables.net/1.13.6/js/dataTables.bootstrap5.min.js"></script>
<script>
console.log('jQuery:', typeof jQuery);
console.log('DataTable:', typeof jQuery.fn.DataTable);

$(document).ready(function() {
    console.log('Initializing DataTable...');
    const table = $('#entriesTable').DataTable({
        pageLength: 10,
        order: [[0, 'desc']],
        dom: 'lfrtip'
    });
    console.log('DataTable initialized:', table);
});

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.user-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    updateCreateButton();
}

function selectByCount() {
    const count = parseInt(document.getElementById('selectCount').value);
    if (!count || count < 1) {
        alert('Please enter a valid number');
        return;
    }
    const checkboxes = document.querySelectorAll('.user-checkbox');
    checkboxes.forEach((cb, index) => {
        cb.checked = index < count;
    });
    document.getElementById('selectAll').checked = count >= checkboxes.length;
    updateCreateButton();
}

function updateCreateButton() {
    const checked = document.querySelectorAll('.user-checkbox:checked').length;
    document.getElementById('createBasketsBtn').disabled = checked === 0;
    document.getElementById('joinContestBtn').disabled = checked === 0;
}

function createBasketsForSelected() {
    const selectedUsers = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
    if (selectedUsers.length === 0) {
        alert('Please select at least one user');
        return;
    }
    const contestId = {{ $contest->id }};
    const sessionId = {{ $contest->league_session_id }};
    window.location.href = `/admin/testing/create-basket?contest=${contestId}&session=${sessionId}&users=${selectedUsers.join(',')}`;
}

async function joinContestForSelected() {
    const selectedUsers = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
    if (selectedUsers.length === 0) {
        alert('Please select at least one user');
        return;
    }
    
    if (!confirm(`Generate random baskets and join contest for ${selectedUsers.length} user(s)?`)) return;
    
    const btn = document.getElementById('joinContestBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing...';
    
    try {
        const response = await fetch('/admin/testing/bulk-join-contest', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            },
            body: JSON.stringify({
                user_ids: selectedUsers,
                contest_id: {{ $contest->id }},
                session_id: {{ $contest->league_session_id }}
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(`Success! ${result.joined} user(s) joined the contest`);
            location.reload();
        } else {
            alert('Error: ' + result.message);
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i>Join Contest';
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to join contest');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i>Join Contest';
    }
}
</script>
@endsection