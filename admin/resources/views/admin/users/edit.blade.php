@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-pencil-square text-warning me-2"></i>Edit User</h1>
            <p class="text-muted mb-0">Modify user information and settings</p>
        </div>
        <a href="{{ route('admin.users.index') }}" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-1"></i>Back to Users
        </a>
    </div>

    <div class="row">
        <div class="col-lg-8">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-gradient-warning text-white">
                    <h5 class="mb-0"><i class="bi bi-gear-fill me-2"></i>User Information</h5>
                </div>
                <div class="card-body p-4">
                    <form method="POST" action="{{ route('admin.users.update', $user->id) }}">
                        @csrf
                        @method('PUT')
                        
                        <!-- Basic Information -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-info-circle me-2"></i>Basic Information</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="name" class="form-label fw-semibold">Full Name <span class="text-danger">*</span></label>
                                    <input type="text" id="name" name="name" class="form-control form-control-lg" 
                                           value="{{ old('name', $user->name) }}" placeholder="Enter full name" required>
                                    @error('name')
                                        <div class="text-danger small mt-1">{{ $message }}</div>
                                    @enderror
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="email" class="form-label fw-semibold">Email Address <span class="text-danger">*</span></label>
                                    <input type="email" id="email" name="email" class="form-control form-control-lg" 
                                           value="{{ old('email', $user->email) }}" placeholder="Enter email address" required>
                                    @error('email')
                                        <div class="text-danger small mt-1">{{ $message }}</div>
                                    @enderror
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="mobile" class="form-label fw-semibold">Mobile Number</label>
                                    <input type="text" id="mobile" name="mobile" class="form-control form-control-lg" 
                                           value="{{ old('mobile', $user->mobile) }}" placeholder="Enter mobile number">
                                    @error('mobile')
                                        <div class="text-danger small mt-1">{{ $message }}</div>
                                    @enderror
                                </div>
                            </div>
                        </div>

                        <!-- Security Settings -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-shield-lock me-2"></i>Security Settings</h6>
                            </div>
                            <div class="col-md-12">
                                <div class="mb-3">
                                    <label for="password" class="form-label fw-semibold">New Password</label>
                                    <div class="input-group">
                                        <input type="password" id="password" name="password" class="form-control form-control-lg" 
                                               placeholder="Leave blank to keep current">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePassword('password')">
                                            <i class="bi bi-eye" id="password-icon"></i>
                                        </button>
                                    </div>
                                    <div class="form-text">Leave empty to keep current password</div>
                                    @error('password')
                                        <div class="text-danger small mt-1">{{ $message }}</div>
                                    @enderror
                                </div>
                            </div>
                        </div>

                        <!-- Financial Information -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-wallet2 me-2"></i>Financial Information</h6>
                            </div>
                            <div class="col-md-4">
                                <div class="mb-3">
                                    <label for="deposit_balance" class="form-label fw-semibold">Deposit Balance</label>
                                    <div class="input-group">
                                        <span class="input-group-text">₹</span>
                                        <input type="number" step="0.01" id="deposit_balance" name="deposit_balance" 
                                               class="form-control form-control-lg" 
                                               value="{{ old('deposit_balance', $user->deposit_balance ?? 0) }}" min="0">
                                    </div>
                                    <div class="form-text">Deposit balance</div>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="mb-3">
                                    <label for="winnings_balance" class="form-label fw-semibold">Winnings Balance</label>
                                    <div class="input-group">
                                        <span class="input-group-text">₹</span>
                                        <input type="number" step="0.01" id="winnings_balance" name="winnings_balance" 
                                               class="form-control form-control-lg" 
                                               value="{{ old('winnings_balance', $user->winnings_balance ?? 0) }}" min="0">
                                    </div>
                                    <div class="form-text">Winnings balance</div>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Total Wallet</label>
                                    <div class="input-group">
                                        <span class="input-group-text">₹</span>
                                        <input type="text" class="form-control form-control-lg" 
                                               value="{{ number_format(($user->deposit_balance ?? 0) + ($user->winnings_balance ?? 0), 2) }}" readonly>
                                    </div>
                                    <div class="form-text">Total (read-only)</div>
                                </div>
                            </div>
                        </div>

                        <!-- Permissions -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-shield-check me-2"></i>Permissions</h6>
                            </div>
                            <div class="col-12">
                                <div class="card bg-light border-0">
                                    <div class="card-body">
                                        <div class="form-check form-switch">
                                            <input type="checkbox" id="is_admin" name="is_admin" value="1" 
                                                   class="form-check-input" {{ $user->is_admin ? 'checked' : '' }}>
                                            <label for="is_admin" class="form-check-label fw-semibold">
                                                <i class="bi bi-shield-fill text-warning me-2"></i>Admin Role
                                            </label>
                                            <div class="form-text">Grant administrative privileges to this user</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="row">
                            <div class="col-12">
                                <div class="d-flex gap-3 justify-content-end">
                                    <a href="{{ route('admin.users.index') }}" class="btn btn-outline-secondary btn-lg px-4">
                                        <i class="bi bi-x-circle me-2"></i>Cancel
                                    </a>
                                    <button type="submit" class="btn btn-warning btn-lg px-4">
                                        <i class="bi bi-check-circle me-2"></i>Update User
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- User Info Sidebar -->
        <div class="col-lg-4">
            <!-- Current User Info -->
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="bi bi-person-circle text-info me-2"></i>Current User Info</h6>
                </div>
                <div class="card-body">
                    <div class="text-center mb-3">
                        <div class="bg-{{ $user->is_admin ? 'warning' : 'primary' }} rounded-circle d-inline-flex align-items-center justify-content-center mb-2" style="width: 60px; height: 60px;">
                            <i class="bi bi-{{ $user->is_admin ? 'shield-fill' : 'person-fill' }} text-white" style="font-size: 24px;"></i>
                        </div>
                        <div class="fw-bold">{{ $user->name }}</div>
                        <div class="text-muted small">{{ $user->email }}</div>
                        @if($user->is_admin)
                            <span class="badge bg-warning text-dark mt-1">Admin User</span>
                        @endif
                    </div>
                    
                    <div class="mb-3">
                        <h6 class="text-primary">User ID</h6>
                        <small class="text-muted">#{{ $user->id }}</small>
                    </div>
                </div>
            </div>

            <!-- Guidelines -->
            <div class="card shadow-sm border-0">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="bi bi-lightbulb text-warning me-2"></i>Guidelines</h6>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <h6 class="text-primary">Security Notes</h6>
                        <ul class="small text-muted mb-0">
                            <li>Only change password if necessary</li>
                            <li>Admin role grants full system access</li>
                            <li>KYC status affects user privileges</li>
                            <li>Wallet balance can be adjusted manually</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
.bg-gradient-warning {
    background: linear-gradient(135deg, #ffc107 0%, #ff8c00 100%);
}

.card {
    border-radius: 15px;
    transition: all 0.3s ease;
}

.form-control, .form-select {
    border-radius: 10px;
    border: 2px solid #e9ecef;
    transition: all 0.3s ease;
}

.form-control:focus, .form-select:focus {
    border-color: #ffc107;
    box-shadow: 0 0 0 0.2rem rgba(255, 193, 7, 0.25);
}

.btn {
    border-radius: 10px;
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

.text-warning {
    color: #ffc107 !important;
}

.form-check-input:checked {
    background-color: #ffc107;
    border-color: #ffc107;
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
function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    const icon = document.getElementById(fieldId + '-icon');
    
    if (field.type === 'password') {
        field.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        field.type = 'password';
        icon.className = 'bi bi-eye';
    }
}
</script>
@endsection