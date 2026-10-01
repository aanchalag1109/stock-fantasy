@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-person-circle text-info me-2"></i>User Profile</h1>
            <p class="text-muted mb-0">Detailed information about {{ $user->name }}</p>
        </div>
        <div class="d-flex gap-2">
            <a href="{{ route('admin.users.edit', $user->id) }}" class="btn btn-warning">
                <i class="bi bi-pencil me-1"></i>Edit User
            </a>
            <a href="{{ route('admin.users.index') }}" class="btn btn-outline-secondary">
                <i class="bi bi-arrow-left me-1"></i>Back to Users
            </a>
        </div>
    </div>

    <div class="row">
        <!-- User Profile Card -->
        <div class="col-lg-4">
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-gradient-info text-white text-center">
                    <div class="py-3">
                        <div class="bg-white rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style="width: 80px; height: 80px;">
                            <i class="bi bi-{{ $user->is_admin ? 'shield-fill text-warning' : 'person-fill text-info' }}" style="font-size: 2.5rem;"></i>
                        </div>
                        <h5 class="mb-1">{{ $user->name }}</h5>
                        <p class="mb-0 opacity-75">{{ $user->email }}</p>
                        @if($user->is_admin)
                            <span class="badge bg-warning text-dark mt-2">Administrator</span>
                        @endif
                    </div>
                </div>
                <div class="card-body">
                    <div class="row text-center">
                        <div class="col-6">
                            <div class="border-end">
                                <div class="h4 text-success mb-0">₹{{ number_format($user->deposit_balance ?? 0, 2) }}</div>
                                <small class="text-muted">Wallet Balance</small>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="h4 text-info mb-0">₹{{ number_format($user->winnings_balance ?? 0, 2) }}</div>
                            <small class="text-muted">Total Winnings</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quick Stats -->
            <div class="card shadow-sm border-0">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="bi bi-graph-up text-primary me-2"></i>Quick Stats</h6>
                </div>
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="text-muted">User ID</span>
                        <span class="fw-bold">#{{ $user->id }}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="text-muted">Member Since</span>
                        <span class="fw-bold">{{ $user->created_at->format('M d, Y') }}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="text-muted">Last Active</span>
                        <span class="fw-bold">{{ $user->updated_at->format('M d, Y') }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Detailed Information -->
        <div class="col-lg-8">
            <!-- Account Information -->
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-gradient-primary text-white">
                    <h5 class="mb-0"><i class="bi bi-person-gear me-2"></i>Account Information</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="mb-3">
                                <label class="form-label fw-semibold text-muted">Full Name</label>
                                <div class="form-control-plaintext fw-bold">{{ $user->name }}</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-semibold text-muted">Email Address</label>
                                <div class="form-control-plaintext">{{ $user->email }}</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-semibold text-muted">Phone Number</label>
                                <div class="form-control-plaintext">{{ $user->mobile ?? 'Not provided' }}</div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="mb-3">
                                <label class="form-label fw-semibold text-muted">Date of Birth</label>
                                <div class="form-control-plaintext">{{ $user->date_of_birth ? $user->date_of_birth->format('M d, Y') : 'Not provided' }}</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-semibold text-muted">Gender</label>
                                <div class="form-control-plaintext">{{ ucfirst($user->gender ?? 'Not specified') }}</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-semibold text-muted">Address</label>
                                <div class="form-control-plaintext">{{ $user->address ?? 'Not provided' }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Financial Information -->
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-gradient-success text-white">
                    <h5 class="mb-0"><i class="bi bi-wallet2 me-2"></i>Financial Information</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="text-center p-3 bg-light rounded">
                                <div class="h4 text-success mb-1">₹{{ number_format($user->deposit_balance ?? 0, 2) }}</div>
                                <small class="text-muted">Current Balance</small>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="text-center p-3 bg-light rounded">
                                <div class="h4 text-info mb-1">₹{{ number_format($user->winnings_balance ?? 0, 2) }}</div>
                                <small class="text-muted">Total Winnings</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


        </div>
    </div>
</div>

<style>
.bg-gradient-primary {
    background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
}

.bg-gradient-info {
    background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
}

.bg-gradient-success {
    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
}

.bg-gradient-warning {
    background: linear-gradient(135deg, #ffc107 0%, #ff8c00 100%);
}

.bg-gradient-secondary {
    background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
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

.btn:hover {
    transform: translateY(-2px);
}

.form-control-plaintext {
    padding: 0.375rem 0;
    margin-bottom: 0;
    font-size: 1rem;
    line-height: 1.5;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.card {
    animation: fadeIn 0.5s ease-out;
}
</style>

<script>
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        // Show success message
        const button = event.target.closest('button');
        const originalIcon = button.innerHTML;
        button.innerHTML = '<i class="bi bi-check"></i>';
        button.classList.add('btn-success');
        button.classList.remove('btn-outline-secondary');
        
        setTimeout(() => {
            button.innerHTML = originalIcon;
            button.classList.remove('btn-success');
            button.classList.add('btn-outline-secondary');
        }, 2000);
    });
}
</script>
@endsection