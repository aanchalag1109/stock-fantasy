<div class="d-flex justify-content-between align-items-center mb-4">
    <div>
        <h2 class="fw-bold mb-1">Manage Users</h2>
        <div class="text-muted">Manage all registered users and their permissions</div>
    </div>
    <a href="{{ route('admin.users.create') }}" class="btn btn-primary btn-lg"><i class="bi bi-plus"></i> Add New User</a>
</div>

<form method="GET" action="" class="mb-4">
    
    <div class="row g-3">
        <div class="col-md-6">
            <input type="text" name="search" class="form-control" placeholder="Search by name or email..." value="{{ request('search') }}">
        </div>
        <div class="col-md-3">
            <select name="kyc_status" class="form-select">
                <option value="">All Statuses</option>
                <option value="pending" {{ request('kyc_status') == 'pending' ? 'selected' : '' }}>Pending</option>
                <option value="verified" {{ request('kyc_status') == 'verified' ? 'selected' : '' }}>Verified</option>
                <option value="rejected" {{ request('kyc_status') == 'rejected' ? 'selected' : '' }}>Rejected</option>
            </select>
        </div>
        <div class="col-md-3">
            <button type="submit" class="btn btn-outline-primary w-100">Search</button>
        </div>
    </div>
</form>

<div class="card shadow-sm">
    <div class="card-body p-0">
        <table class="table table-hover mb-0">
            <thead class="table-light">
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Wallet</th>
                </tr>
            </thead>
            <tbody>
                @forelse($users as $user)
                <tr>
                    <td>{{ $user->name }}</td>
                    <td>{{ $user->email }}</td>
                    <td>₹{{ number_format($user->wallet_balance, 2) }}</td>
                </tr>
                @empty
                <tr>
                    <td colspan="3" class="text-center text-muted">No users found.</td>
                </tr>
                @endforelse
            </tbody>
        </table>
    </div>
    @if(method_exists($users, 'links'))
    <div class="card-footer bg-white py-3">
        <nav>
            <ul class="pagination justify-content-center mb-0">
                {{ $users->links() }}
            </ul>
        </nav>
    </div>
    @endif
</div>