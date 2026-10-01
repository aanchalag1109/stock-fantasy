@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-trophy-fill text-warning me-2"></i>Contest Management</h1>
            <p class="text-muted mb-0">Manage trading contests and competitions</p>
        </div>
        <a href="{{ route('admin.contests.create') }}" class="btn btn-warning btn-lg">
            <i class="bi bi-plus-circle me-2"></i>Create Contest
        </a>
    </div>

    <!-- Stats Cards -->
    <div class="row mb-4">
        <div class="col-xl-3 col-md-6">
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0">
                            <div class="bg-warning bg-opacity-10 rounded-circle p-3">
                                <i class="bi bi-trophy text-warning" style="font-size: 1.5rem;"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1 ms-3">
                            <div class="small text-muted">Total Contests</div>
                            <div class="h4 mb-0">{{ $contests->count() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-xl-3 col-md-6">
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0">
                            <div class="bg-success bg-opacity-10 rounded-circle p-3">
                                <i class="bi bi-broadcast text-success" style="font-size: 1.5rem;"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1 ms-3">
                            <div class="small text-muted">Live Contests</div>
                            <div class="h4 mb-0">{{ $contests->where('status', 'live')->count() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-xl-3 col-md-6">
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0">
                            <div class="bg-info bg-opacity-10 rounded-circle p-3">
                                <i class="bi bi-clock text-info" style="font-size: 1.5rem;"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1 ms-3">
                            <div class="small text-muted">Upcoming</div>
                            <div class="h4 mb-0">{{ $contests->where('status', 'upcoming')->count() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-xl-3 col-md-6">
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0">
                            <div class="bg-primary bg-opacity-10 rounded-circle p-3">
                                <i class="bi bi-coin text-primary" style="font-size: 1.5rem;"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1 ms-3">
                            <div class="small text-muted">Total Pool</div>
                            <div class="h4 mb-0">{{ number_format($contests->sum('prize_pool'), 0) }} probcoins</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Filters -->
    <div class="card border-0 shadow-sm mb-4">
        <div class="card-header bg-gradient-warning text-white">
            <h6 class="mb-0"><i class="bi bi-funnel me-2"></i>Filter Contests</h6>
        </div>
        <div class="card-body">
            <div class="btn-group" role="group">
                <a href="?status=live" class="btn {{ ($status ?? '') == 'live' ? 'btn-success' : 'btn-outline-success' }}">
                    <i class="bi bi-broadcast me-1"></i>Live <span class="badge bg-light text-dark ms-1">{{ $contests->where('status', 'live')->count() }}</span>
                </a>
                <a href="?status=upcoming" class="btn {{ ($status ?? '') == 'upcoming' ? 'btn-info' : 'btn-outline-info' }}">
                    <i class="bi bi-clock me-1"></i>Upcoming <span class="badge bg-light text-dark ms-1">{{ $contests->where('status', 'upcoming')->count() }}</span>
                </a>
                <a href="?status=completed" class="btn {{ ($status ?? '') == 'completed' ? 'btn-warning' : 'btn-outline-warning' }}">
                    <i class="bi bi-check-circle me-1"></i>Completed <span class="badge bg-light text-dark ms-1">{{ $contests->where('status', 'completed')->count() }}</span>
                </a>
                <a href="{{ route('admin.contests.index') }}" class="btn {{ !($status ?? '') ? 'btn-dark' : 'btn-outline-dark' }}">
                    <i class="bi bi-list me-1"></i>All <span class="badge bg-light text-dark ms-1">{{ $contests->count() }}</span>
                </a>
            </div>
        </div>
    </div>

    <!-- Contests Table -->
    <div class="card border-0 shadow-sm">
        <div class="card-header bg-gradient-warning text-white">
            <div class="d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center">
                    <input type="checkbox" id="selectAll" class="me-3">
                    <h5 class="mb-0"><i class="bi bi-trophy me-2"></i>All Contests</h5>
                </div>
                <button onclick="bulkDelete()" id="bulkDeleteBtn" class="btn btn-danger btn-sm" style="display:none;">
                    <i class="bi bi-trash me-1"></i>Delete Selected
                </button>
            </div>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th class="fw-semibold">☑</th>
                            <th class="fw-semibold">#</th>
                            <th class="fw-semibold"><i class="bi bi-trophy me-1"></i>Contest Details</th>
                            <th class="fw-semibold"><i class="bi bi-tag me-1"></i>Category</th>
                            <th class="fw-semibold"><i class="bi bi-coin me-1"></i>Entry Fee</th>
                            <th class="fw-semibold"><i class="bi bi-gift me-1"></i>Pool Details</th>
                            <th class="fw-semibold"><i class="bi bi-people me-1"></i>Participants</th>
                            <th class="fw-semibold"><i class="bi bi-calendar me-1"></i>Schedule</th>
                            <th class="fw-semibold text-center"><i class="bi bi-gear me-1"></i>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($contests as $contest)
                        <tr class="{{ $contest->status === 'cancelled' ? 'table-danger' : '' }}">
                            <td>
                                @if($contest->status !== 'live')
                                    <input type="checkbox" class="contest-checkbox" value="{{ $contest->id }}">
                                @endif
                            </td>
                            <td>
                                <div class="d-flex align-items-center">
                                    <div class="bg-warning rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                                        <i class="bi bi-trophy text-white"></i>
                                    </div>
                                    <span class="ms-2 fw-semibold">{{ $contest->id }}</span>
                                </div>
                            </td>
                            <td>
                                <div>
                                    @if($contest->leagueSession)
                                        <div class="fw-semibold text-primary">Session: {{ $contest->leagueSession->name }}</div>
                                    @endif
                                    <div class="fw-semibold text-dark">Contest: {{ $contest->name ?? 'Contest #' . $contest->id }}</div>
                                    @if($contest->description)
                                        <small class="text-muted d-block">{{ Str::limit($contest->description, 50) }}</small>
                                    @endif
                                </div>
                            </td>
                            <td>
                                @php
                                    $categoryColors = [
                                        'mega' => 'primary',
                                        'equal' => 'success',
                                        'practice' => 'info',
                                        'guaranteed' => 'danger'
                                    ];
                                    $statusColors = [
                                        'active' => 'success',
                                        'cancelled' => 'danger'
                                    ];
                                    $sessionStatus = $contest->leagueSession->status ?? 'upcoming';
                                    $sessionStatusColors = [
                                        'upcoming' => 'info',
                                        'live' => 'warning',
                                        'completed' => 'secondary'
                                    ];
                                @endphp
                                <span class="badge bg-{{ $categoryColors[$contest->category] ?? 'secondary' }}">
                                    {{ ucfirst($contest->category) }}
                                </span>
                                @if($contest->is_pinned)
                                    <span class="badge bg-dark mt-1"><i class="bi bi-pin-angle-fill"></i> Pinned</span>
                                @endif
                                <br>
                                <span class="badge bg-{{ $statusColors[$contest->status] ?? 'secondary' }} mt-1">
                                    {{ ucfirst($contest->status) }}
                                </span>
                                <br>
                                <small class="badge bg-{{ $sessionStatusColors[$sessionStatus] ?? 'secondary' }} mt-1">
                                    Session: {{ ucfirst($sessionStatus) }}
                                </small>
                            </td>
                            <td><span class="fw-bold text-success">{{ number_format($contest->entry_fee, 0) }} probcoins</span></td>
                            <td>
                                @php
                                    $totalPool = $contest->entry_fee * $contest->participants;
                                    $platformFeePercent = $contest->platform_fee ?? 10;
                                    $platformFee = ($totalPool * $platformFeePercent) / 100;
                                    $prizePool = $totalPool - $platformFee;
                                    $winningPercent = $contest->winning_percentage ?? 30;
                                    $totalWinners = round(($contest->participants * $winningPercent) / 100);
                                @endphp
                                <div class="small">
                                    <div><strong>Prize Pool:</strong> {{ number_format($contest->prize_pool, 0) }} probcoins</div>
                                    <div><strong>Total Winners:</strong> {{ $totalWinners }}</div>
                                </div>
                            </td>
                            <td>
                                <div class="d-flex align-items-center">
                                    <div class="progress me-2" style="width: 60px; height: 8px;">
                                        @php
                                            $joinedCount = $contest->participants_count ?? 0;
                                            $maxParticipants = $contest->participants ?? 100;
                                            $percentage = $contest->progress_percentage ?? 0;
                                        @endphp
                                        <div class="progress-bar bg-success" style="width: {{ min($percentage, 100) }}%"></div>
                                    </div>
                                    <small class="text-muted">{{ $joinedCount }}/{{ $maxParticipants }}</small>
                                </div>
                            </td>
                            <td>
                                <div class="small">
                                    @if($contest->start_time)
                                        <div><i class="bi bi-play-circle text-success me-1"></i>{{ date('M j, H:i', strtotime($contest->start_time)) }}</div>
                                    @endif
                                    @if($contest->end_time)
                                        <div><i class="bi bi-stop-circle text-danger me-1"></i>{{ date('M j, H:i', strtotime($contest->end_time)) }}</div>
                                    @endif
                                </div>
                            </td>
                            <td class="text-center">
                                <div class="btn-group btn-group-sm">
                                    <a href="{{ route('admin.contests.show', $contest->id) }}" class="btn btn-outline-info" title="View Details">
                                        <i class="bi bi-eye"></i>
                                    </a>
                                    <button onclick="togglePin({{ $contest->id }})" class="btn btn-outline-dark" title="{{ $contest->is_pinned ? 'Unpin' : 'Pin to top' }}">
                                        <i class="bi {{ $contest->is_pinned ? 'bi-pin-angle-fill' : 'bi-pin-angle' }}"></i>
                                    </button>
                                    @if($contest->status !== 'cancelled')
                                    <a href="{{ route('admin.contests.edit', $contest->id) }}" class="btn btn-outline-primary" title="Edit Contest">
                                        <i class="bi bi-pencil"></i>
                                    </a>
                                    <button onclick="cancelContest({{ $contest->id }})" class="btn btn-outline-warning" title="Cancel Contest">
                                        <i class="bi bi-x-circle"></i>
                                    </button>
                                    @endif
                                    <form action="{{ route('admin.contests.destroy', $contest->id) }}" method="POST" class="d-inline">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="btn btn-outline-danger" title="Delete Contest" onclick="return confirm('Delete this contest?')">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="9" class="text-center py-5">
                                <div class="text-muted">
                                    <i class="bi bi-trophy display-1 d-block mb-3"></i>
                                    <h5>No contests found</h5>
                                    <p>Create your first contest to get started.</p>
                                    <a href="{{ route('admin.contests.create') }}" class="btn btn-warning">
                                        <i class="bi bi-plus-circle me-1"></i>Create Contest
                                    </a>
                                </div>
                            </td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
        @if($contests->hasPages())
        <div class="card-footer bg-light">
            <div class="d-flex justify-content-between align-items-center">
                <div class="text-muted small">
                    Showing {{ $contests->firstItem() }} to {{ $contests->lastItem() }} of {{ $contests->total() }} contests
                </div>
                <div>
                    {{ $contests->appends(request()->query())->links('pagination::bootstrap-4') }}
                </div>
            </div>
        </div>
        @endif
    </div>
</div>

<script>
// Bulk delete functionality
document.addEventListener('DOMContentLoaded', function() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const contestCheckboxes = document.querySelectorAll('.contest-checkbox');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    
    // Select all functionality
    selectAllCheckbox?.addEventListener('change', function() {
        contestCheckboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
        toggleBulkDeleteButton();
    });
    
    contestCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', toggleBulkDeleteButton);
    });
    
    function toggleBulkDeleteButton() {
        const checkedBoxes = document.querySelectorAll('.contest-checkbox:checked');
        if (checkedBoxes.length > 0) {
            bulkDeleteBtn.style.display = 'inline-block';
        } else {
            bulkDeleteBtn.style.display = 'none';
        }
    }
});

function bulkDelete() {
    const checkedBoxes = document.querySelectorAll('.contest-checkbox:checked');
    if (checkedBoxes.length === 0) {
        alert('Please select contests to delete.');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete ${checkedBoxes.length} selected contests?`)) {
        return;
    }
    
    const contestIds = Array.from(checkedBoxes).map(cb => cb.value);
    
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '{{ route("admin.contests.bulk_delete") }}';
    
    const csrfToken = document.createElement('input');
    csrfToken.type = 'hidden';
    csrfToken.name = '_token';
    csrfToken.value = '{{ csrf_token() }}';
    form.appendChild(csrfToken);
    
    contestIds.forEach(id => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'contest_ids[]';
        input.value = id;
        form.appendChild(input);
    });
    
    document.body.appendChild(form);
    form.submit();
}

function cancelContest(contestId) {
    if (!confirm('Are you sure you want to cancel this contest? All users will be refunded.')) {
        return;
    }
    
    fetch(`/admin/contests/${contestId}/cancel`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            location.reload();
        } else {
            alert('Error: ' + data.message);
        }
    })
    .catch(error => {
        alert('Error cancelling contest');
        console.error(error);
    });
}

function togglePin(contestId) {
    fetch(`/admin/contests/${contestId}/pin`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            location.reload();
        } else {
            alert('Error: ' + (data.message || 'Failed to pin'));
        }
    })
    .catch(error => {
        alert('Error toggling pin');
        console.error(error);
    });
}
</script>

<style>
.bg-gradient-warning {
    background: linear-gradient(135deg, #ffc107 0%, #ff8c00 100%);
}

.card {
    border-radius: 15px;
    transition: all 0.3s ease;
}

.btn {
    border-radius: 8px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.btn-warning {
    background: linear-gradient(135deg, #ffc107 0%, #ff8c00 100%);
    border: none;
    color: white;
}

.btn-warning:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(255, 193, 7, 0.4);
    color: white;
}

.table tbody tr:hover {
    background-color: #f8f9fa;
    transform: scale(1.01);
    transition: all 0.2s ease;
}

.table-danger {
    background-color: #f8d7da !important;
}

.table-danger:hover {
    background-color: #f5c2c7 !important;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.card {
    animation: fadeIn 0.5s ease-out;
}
</style>
@endsection