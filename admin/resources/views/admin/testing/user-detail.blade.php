@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-md-6">
            <div class="card">
                <div class="card-header d-flex justify-content-between">
                    <div>
                        <h5 class="mb-0">User Details - {{ $user->name ?? 'User' }} (ID: {{ $user->id }})</h5>
                        <small class="text-muted">Mobile: {{ $user->mobile }}</small>
                    </div>
                    <a href="{{ route('admin.testing.index') }}" class="btn btn-sm btn-outline-secondary">Back to Testing</a>
                </div>
                <div class="card-body">
                    <table class="table table-borderless">
                        <tr>
                            <th width="30%">Name:</th>
                            <td>{{ $user->name ?? 'N/A' }}</td>
                        </tr>
                        <tr>
                            <th>Mobile:</th>
                            <td>{{ $user->mobile }}</td>
                        </tr>
                        <tr>
                            <th>Email:</th>
                            <td>{{ $user->email ?? 'N/A' }}</td>
                        </tr>
                        <tr>
                            <th>Balance:</th>
                            <td>{{ $user->winnings_balance ?? 0 }} probcoins</td>
                        </tr>
                        <tr>
                            <th>Created:</th>
                            <td>{{ date('M d, Y H:i', strtotime($user->created_at)) }}</td>
                        </tr>
                    </table>
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="card">
                <div class="card-header">
                    <h5 class="mb-0">Upcoming Sessions</h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Start Time</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse($upcomingSessions as $session)
                                <tr>
                                    <td>{{ $session->id }}</td>
                                    <td>{{ $session->name }}</td>
                                    <td>{{ date('M d, H:i', strtotime($session->start_time)) }}</td>
                                    <td>
                                        <a href="{{ route('admin.testing.user-session-contests', [$user->id, $session->id]) }}" class="btn btn-xs btn-outline-success">View Contests</a>
                                    </td>
                                </tr>
                                @empty
                                <tr>
                                    <td colspan="4" class="text-center text-muted">No upcoming sessions found</td>
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