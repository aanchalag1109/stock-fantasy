@extends('admin.layouts.app')

@section('title', 'Test Users')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h3">Test Users List</h1>
        <div>
            <button id="bulkDeleteBtn" class="btn btn-danger me-2" style="display:none;" onclick="bulkDelete()">
                <i class="bi bi-trash me-2"></i>Delete Selected
            </button>
            <form action="{{ route('admin.testing.generate-users') }}" method="POST" class="d-inline" onsubmit="return confirm('Generate 100 random test users?');">
                @csrf
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-plus-circle me-2"></i>Generate 100 Test Users
                </button>
            </form>
        </div>
    </div>

    <div class="card shadow-sm">
        <div class="card-header fw-bold">All Test Users</div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table align-middle mb-0">
                    <thead>
                        <tr>
                            <th><input type="checkbox" id="selectAll"></th>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Mobile</th>
                            <th>Email</th>
                            <th>Type</th>
                            <th>Deposit Balance</th>
                            <th>Winning Balance</th>
                            <th>Registered</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($users as $user)
                        <tr>
                            <td><input type="checkbox" class="user-checkbox" value="{{ $user->id }}"></td>
                            <td>{{ $user->id }}</td>
                            <td>{{ $user->name }}</td>
                            <td>{{ $user->mobile }}</td>
                            <td>{{ $user->email ?? 'N/A' }}</td>
                            <td>
                                @if($user->is_test_user)
                                    <span class="badge bg-warning">Test User</span>
                                @else
                                    <span class="badge bg-success">Real User</span>
                                @endif
                            </td>
                            <td>₹{{ number_format($user->deposit_balance, 2) }}</td>
                            <td>₹{{ number_format($user->winnings_balance, 2) }}</td>
                            <td>{{ $user->created_at->format('d M Y') }}</td>
                            <td>
                                <a href="{{ route('admin.users.show', $user->id) }}" class="btn btn-sm btn-outline-info">
                                    <i class="bi bi-eye"></i> View
                                </a>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="10" class="text-center text-muted">No users found.</td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
            @if(method_exists($users, 'links'))
            <div class="card-footer bg-white py-3">
                {{ $users->links('pagination::bootstrap-5') }}
            </div>
            @endif
        </div>
    </div>
</div>

<script>
document.getElementById('selectAll').addEventListener('change', function() {
    const checkboxes = document.querySelectorAll('.user-checkbox');
    checkboxes.forEach(cb => cb.checked = this.checked);
    toggleBulkDeleteBtn();
});

document.querySelectorAll('.user-checkbox').forEach(cb => {
    cb.addEventListener('change', toggleBulkDeleteBtn);
});

function toggleBulkDeleteBtn() {
    const checked = document.querySelectorAll('.user-checkbox:checked').length;
    document.getElementById('bulkDeleteBtn').style.display = checked > 0 ? 'inline-block' : 'none';
}

function bulkDelete() {
    const selected = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
    if (selected.length === 0) return;
    
    if (!confirm(`Delete ${selected.length} test user(s)?`)) return;
    
    fetch('{{ route("admin.testing.bulk-delete-users") }}', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        },
        body: JSON.stringify({ ids: selected })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            location.reload();
        } else {
            alert('Error: ' + data.message);
        }
    })
    .catch(error => alert('Error: ' + error.message));
}
</script>
@endsection
