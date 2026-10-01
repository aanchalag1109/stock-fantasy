@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header d-flex justify-content-between">
                    <h5 class="mb-0">Users List</h5>
                    <button class="btn btn-sm btn-outline-secondary" onclick="refreshUsers()">Refresh</button>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-sm" id="usersTable">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Mobile</th>
                                    <th>Email</th>
                                    <th>Balance</th>
                                    <th>Created</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($users as $user)
                                <tr>
                                    <td>{{ $user->id }}</td>
                                    <td>{{ $user->name ?? 'N/A' }}</td>
                                    <td>{{ $user->mobile }}</td>
                                    <td>{{ $user->email ?? 'N/A' }}</td>
                                    <td>{{ $user->winnings_balance ?? 0 }}</td>
                                    <td>{{ date('M d', strtotime($user->created_at)) }}</td>
                                    <td>
                                        <a href="{{ route('admin.testing.user-detail', $user->id) }}" class="btn btn-xs btn-outline-primary">View</a>
                                    </td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                    <div class="d-flex justify-content-center mt-3">
                        {{ $users->links('pagination::bootstrap-4') }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function viewUser(userId) {
    alert('View User ID: ' + userId);
}

function refreshUsers() {
    location.reload();
}
</script>
@endsection