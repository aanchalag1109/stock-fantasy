@extends('admin.layouts.app')

@section('title', 'Manage Users')

@section('head')
<script>
function openWalletModal(userId, userName, action) {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            openWalletModal(userId, userName, action);
        });
        return;
    }
    
    const walletModalEl = document.getElementById('walletModal');
    let walletModal = walletModalEl ? new bootstrap.Modal(walletModalEl) : null;
    
    const form = document.getElementById('walletForm');
    const title = document.getElementById('walletModalTitle');
    const userNameEl = document.getElementById('walletUserName');
    const submitBtn = document.getElementById('walletSubmitBtn');
    
    if (action === 'add') {
        title.textContent = 'Add Probcoins';
        form.action = '{{ url("admin/users") }}/' + userId + '/wallet/add';
        submitBtn.textContent = 'Add Probcoins';
        submitBtn.className = 'btn btn-success';
    } else {
        title.textContent = 'Remove Probcoins';
        form.action = '{{ url("admin/users") }}/' + userId + '/wallet/remove';
        submitBtn.textContent = 'Remove Probcoins';
        submitBtn.className = 'btn btn-danger';
    }
    
    userNameEl.textContent = userName;
    document.getElementById('amount').value = '';
    document.getElementById('reason').value = '';
    
    if (walletModal) {
        walletModal.show();
    }
}
</script>
@endsection

@section('content')
<div class="container-fluid">
    <!-- Page Header -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-people-fill text-primary me-2"></i>User Management</h1>
            <p class="text-muted mb-0">Manage all registered users and their permissions</p>
        </div>
        <div>
            <a href="{{ route('admin.users.create') }}" class="btn btn-primary btn-lg">
                <i class="bi bi-person-plus me-2"></i>Add New User
            </a>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="row mb-4">
        <div class="col-xl-3 col-md-6">
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0">
                            <div class="bg-primary bg-opacity-10 rounded-circle p-3">
                                <i class="bi bi-people text-primary" style="font-size: 1.5rem;"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1 ms-3">
                            <div class="small text-muted">Total Users</div>
                            <div class="h4 mb-0">{{ $users->total() ?? $users->count() }}</div>
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
                                <i class="bi bi-shield-check text-info" style="font-size: 1.5rem;"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1 ms-3">
                            <div class="small text-muted">Admin Users</div>
                            <div class="h4 mb-0">{{ $users->where('is_admin', true)->count() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Search and Filter Card -->
    <div class="card border-0 shadow-sm mb-4">
        <div class="card-header bg-gradient-primary text-white">
            <h6 class="mb-0"><i class="bi bi-funnel me-2"></i>Search & Filter</h6>
        </div>
        <div class="card-body">
            <form action="{{ route('admin.users.index') }}" method="GET" class="row g-3">
                <div class="col-md-4">
                    <label for="search" class="form-label fw-semibold">Search Users</label>
                    <div class="input-group">
                        <span class="input-group-text bg-light border-end-0">
                            <i class="bi bi-search text-muted"></i>
                        </span>
                        <input type="text" class="form-control border-start-0" id="search" name="search" 
                               placeholder="Search by name or email..." value="{{ request('search') }}">
                    </div>
                </div>

                <div class="col-md-3">
                    <label for="is_admin" class="form-label fw-semibold">User Type</label>
                    <select class="form-select" id="is_admin" name="is_admin">
                        <option value="">All Users</option>
                        <option value="1" {{ request('is_admin') == '1' ? 'selected' : '' }}>🛡️ Admin Users</option>
                        <option value="0" {{ request('is_admin') == '0' ? 'selected' : '' }}>👤 Regular Users</option>
                    </select>
                </div>
                <div class="col-md-2 d-flex align-items-end">
                    <button type="submit" class="btn btn-primary w-100">
                        <i class="bi bi-search me-1"></i>Search
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- User List -->
    <div class="card border-0 shadow-sm mb-4">
        <div class="card-header bg-gradient-primary text-white d-flex justify-content-between align-items-center">
            <h5 class="mb-0"><i class="bi bi-people me-2"></i>All Users</h5>
            <div class="d-flex align-items-center">
                <button type="button" class="btn btn-danger btn-sm me-2" id="bulkDeleteBtn" style="display: none;">
                    <i class="bi bi-trash me-1"></i>Delete Selected (<span id="selectedCount">0</span>)
                </button>
                <button type="button" class="btn btn-outline-light btn-sm" id="selectAllBtn">
                    <i class="bi bi-check-square me-1"></i>Select All
                </button>
            </div>
        </div>
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th class="fw-semibold">
                            <input type="checkbox" class="form-check-input" id="selectAll">
                        </th>
                        <th class="fw-semibold">#</th>
                        <th class="fw-semibold"><i class="bi bi-person me-1"></i>User Details</th>
                        <th class="fw-semibold"><i class="bi bi-wallet2 me-1"></i>Wallet</th>
                        <th class="fw-semibold"><i class="bi bi-trophy me-1"></i>Winnings</th>

                        <th class="fw-semibold"><i class="bi bi-calendar me-1"></i>Joined</th>
                        <th class="fw-semibold text-center"><i class="bi bi-gear me-1"></i>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse($users as $user)
                    <tr>
                        <td>
                            <input type="checkbox" class="form-check-input user-checkbox" value="{{ $user->id }}">
                        </td>
                        <td>
                            <div class="d-flex align-items-center">
                                <div class="bg-{{ $user->is_admin ? 'warning' : 'primary' }} rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                                    <i class="bi bi-{{ $user->is_admin ? 'shield-fill' : 'person-fill' }} text-white"></i>
                                </div>
                                <span class="ms-2 fw-semibold">{{ $user->id }}</span>
                            </div>
                        </td>
                        <td>
                            <div>
                                <div class="fw-semibold text-dark">{{ $user->name }}</div>
                                <div class="small text-muted">{{ $user->email }}</div>
                                @if($user->mobile)
                                    <div class="small text-info"><i class="bi bi-telephone me-1"></i>{{ $user->mobile }}</div>
                                @endif
                                @if($user->is_admin)
                                    <span class="badge bg-warning text-dark small">Admin</span>
                                @endif
                            </div>
                        </td>
                        <td>
                            <div class="fw-bold text-success">{{ number_format($user->deposit_balance ?? 0, 2) }} probcoins</div>
                            <div class="small text-muted">Deposit Balance</div>
                        </td>
                        <td>
                            <div class="fw-bold text-info">{{ number_format($user->winnings_balance ?? 0, 2) }} probcoins</div>
                            <div class="small text-muted">Winnings Balance</div>
                        </td>

                        <td>
                            <div class="small">
                                <div class="fw-semibold">{{ $user->created_at->format('M j, Y') }}</div>
                                <div class="text-muted">{{ $user->created_at->format('H:i') }}</div>
                            </div>
                        </td>
                        <td class="text-center">
                            <div class="btn-group btn-group-sm">
                                @if(Route::has('admin.users.show'))
                                <a href="{{ route('admin.users.show', $user->id) }}" class="btn btn-outline-info" title="View User">
                                    <i class="bi bi-eye"></i>
                                </a>
                                @endif
                                <a href="{{ route('admin.users.edit', $user->id) }}" class="btn btn-outline-primary" title="Edit User">
                                    <i class="bi bi-pencil"></i>
                                </a>
                            </div>
                        </td>
                    </tr>
                    @empty
                    <tr>
                        <td colspan="6" class="text-center py-5">
                            <div class="text-muted">
                                <i class="bi bi-people display-1 d-block mb-3"></i>
                                <h5>No users found</h5>
                                <p>Try adjusting your search criteria or add a new user.</p>
                                <a href="{{ route('admin.users.create') }}" class="btn btn-primary">
                                    <i class="bi bi-person-plus me-1"></i>Add New User
                                </a>
                            </div>
                        </td>
                    </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
        @if(method_exists($users, 'links'))
        <div class="card-footer bg-light py-3">
            <div class="d-flex justify-content-between align-items-center">
                <div class="text-muted small">
                    Showing {{ $users->firstItem() ?? 0 }} to {{ $users->lastItem() ?? 0 }} of {{ $users->total() ?? $users->count() }} users
                </div>
                <nav>
                    {!! $users->withQueryString()->links('pagination::bootstrap-5') !!}
                </nav>
            </div>
        </div>
        @endif
    </div>
</div>

<!-- Bulk Delete Form -->
<form id="bulkDeleteForm" method="POST" action="{{ route('admin.users.bulk-delete') }}" style="display: none;">
    @csrf
    @method('DELETE')
    <input type="hidden" name="user_ids" id="bulkDeleteIds">
</form>

<!-- Bulk Delete Confirmation Modal -->
<div class="modal fade" id="bulkDeleteModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Confirm Bulk Delete</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to delete <strong><span id="deleteCount">0</span></strong> selected user(s)?</p>
                <p class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>This action cannot be undone.</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-danger" id="confirmBulkDelete">
                    <i class="bi bi-trash me-1"></i>Delete Users
                </button>
            </div>
        </div>
    </div>
</div>

<!-- Wallet Management Modal -->
<div class="modal fade" id="walletModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="walletModalTitle">Manage Wallet</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form id="walletForm" method="POST">
                @csrf
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-semibold">User</label>
                        <div class="form-control-plaintext" id="walletUserName"></div>
                    </div>
                    <div class="mb-3">
                        <label for="amount" class="form-label fw-semibold">Amount (Probcoins)</label>
                        <input type="number" class="form-control" id="amount" name="amount" min="0.01" step="0.01" required>
                    </div>
                    <div class="mb-3">
                        <label for="reason" class="form-label fw-semibold">Reason</label>
                        <textarea class="form-control" id="reason" name="reason" rows="3" placeholder="Enter reason for this transaction..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn" id="walletSubmitBtn">Update Wallet</button>
                </div>
            </form>
        </div>
    </div>
</div>

<style>
.bg-gradient-primary {
    background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
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

.btn-primary {
    background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
    border: none;
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0, 123, 255, 0.4);
}

.table tbody tr:hover {
    background-color: #f8f9fa;
    transform: scale(1.01);
    transition: all 0.2s ease;
}

.input-group-text {
    border-color: #dee2e6;
}

.form-control:focus {
    border-color: #007bff;
    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.card {
    animation: fadeIn 0.5s ease-out;
}

/* Bulk delete styles */
.user-checkbox {
    transform: scale(1.1);
}

.user-checkbox:checked {
    background-color: #dc3545;
    border-color: #dc3545;
}

tr.selected {
    background-color: #fff5f5 !important;
    border-left: 3px solid #dc3545;
}

#bulkDeleteBtn {
    animation: slideInRight 0.3s ease-out;
}

@keyframes slideInRight {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
}
</style>
@endsection

@push('scripts')
<script>
    document.addEventListener('DOMContentLoaded', function() {
        // Auto-submit filter form when dropdowns change
        const filterForm = document.querySelector('form[method="GET"]');
        if (filterForm) {
            const filterSelects = filterForm.querySelectorAll('select');
            filterSelects.forEach(select => {
                if (select) {
                    select.addEventListener('change', function() {
                        filterForm.submit();
                    });
                }
            });
        }
        
        // Only run bulk delete code if we're on the users page
        if (!document.querySelector('.user-checkbox')) return;

        // Bulk operations functionality
        const selectAllCheckbox = document.getElementById('selectAll');
        const selectAllBtn = document.getElementById('selectAllBtn');
        const userCheckboxes = document.querySelectorAll('.user-checkbox');
        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        const selectedCountSpan = document.getElementById('selectedCount');
        const bulkDeleteModalEl = document.getElementById('bulkDeleteModal');
        const deleteCountSpan = document.getElementById('deleteCount');
        const confirmBulkDeleteBtn = document.getElementById('confirmBulkDelete');
        const bulkDeleteForm = document.getElementById('bulkDeleteForm');
        const bulkDeleteIds = document.getElementById('bulkDeleteIds');
        
        if (!selectAllCheckbox || !bulkDeleteBtn || userCheckboxes.length === 0) return;
        
        const bulkDeleteModal = bulkDeleteModalEl ? new bootstrap.Modal(bulkDeleteModalEl) : null;

        function updateBulkControls() {
            const checkedBoxes = document.querySelectorAll('.user-checkbox:checked');
            const count = checkedBoxes.length;
            
            if (selectedCountSpan) selectedCountSpan.textContent = count;
            if (bulkDeleteBtn) bulkDeleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
            
            // Update select all checkbox state
            if (selectAllCheckbox) {
                if (count === 0) {
                    selectAllCheckbox.indeterminate = false;
                    selectAllCheckbox.checked = false;
                } else if (count === userCheckboxes.length) {
                    selectAllCheckbox.indeterminate = false;
                    selectAllCheckbox.checked = true;
                } else {
                    selectAllCheckbox.indeterminate = true;
                }
            }
        }

        // Select all functionality
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', function() {
                userCheckboxes.forEach(checkbox => {
                    checkbox.checked = this.checked;
                    const row = checkbox.closest('tr');
                    if (this.checked) {
                        row.classList.add('selected');
                    } else {
                        row.classList.remove('selected');
                    }
                });
                updateBulkControls();
            });
        }

        // Select all button functionality
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', function() {
                const allChecked = Array.from(userCheckboxes).every(cb => cb.checked);
                const shouldCheck = !allChecked;
                
                userCheckboxes.forEach(checkbox => {
                    checkbox.checked = shouldCheck;
                    const row = checkbox.closest('tr');
                    if (shouldCheck) {
                        row.classList.add('selected');
                    } else {
                        row.classList.remove('selected');
                    }
                });
                
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = shouldCheck;
                    selectAllCheckbox.indeterminate = false;
                }
                
                updateBulkControls();
            });
        }

        // Individual checkbox change
        userCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const row = this.closest('tr');
                if (this.checked) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
                updateBulkControls();
            });
        });

        // Bulk delete button click
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', function() {
                const checkedBoxes = document.querySelectorAll('.user-checkbox:checked');
                const count = checkedBoxes.length;
                
                if (count > 0 && deleteCountSpan && bulkDeleteModal) {
                    deleteCountSpan.textContent = count;
                    bulkDeleteModal.show();
                }
            });
        }

        // Confirm bulk delete
        if (confirmBulkDeleteBtn) {
            confirmBulkDeleteBtn.addEventListener('click', function() {
                const checkedBoxes = document.querySelectorAll('.user-checkbox:checked');
                const userIds = Array.from(checkedBoxes).map(cb => cb.value);
                
                if (userIds.length > 0 && bulkDeleteIds && bulkDeleteForm) {
                    bulkDeleteIds.value = JSON.stringify(userIds);
                    bulkDeleteForm.submit();
                }
            });
        }

        // Initialize bulk controls
        updateBulkControls();
    });
</script>
@endpush
