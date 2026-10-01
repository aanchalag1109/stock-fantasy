@extends('admin.layouts.app')

@section('title', 'Manage My Game')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h3">Upcoming Sessions</h1>
    </div>

    <!-- Upcoming Sessions List -->
    <div class="row">
        <div class="col-12">
            <div class="card shadow-sm">
                <div class="card-header fw-bold bg-primary text-white">
                    <i class="bi bi-calendar2-week me-2"></i>Upcoming Sessions List
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table align-middle mb-0">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Session Name</th>
                                    <th>Start Time</th>
                                    <th>End Time</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse($upcomingSessions as $session)
                                <tr>
                                    <td>{{ $session->id }}</td>
                                    <td>{{ $session->name }}</td>
                                    <td>{{ \Carbon\Carbon::parse($session->start_time)->format('d M Y, h:i A') }}</td>
                                    <td>{{ \Carbon\Carbon::parse($session->end_time)->format('d M Y, h:i A') }}</td>
                                    <td><span class="badge bg-info">{{ ucfirst($session->status) }}</span></td>
                                    <td>
                                        <a href="{{ route('admin.testing.session-contests', $session->id) }}" class="btn btn-sm btn-outline-info">
                                            <i class="bi bi-eye"></i> View
                                        </a>
                                    </td>
                                </tr>
                                @empty
                                <tr>
                                    <td colspan="6" class="text-center text-muted py-4">No upcoming sessions found.</td>
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
