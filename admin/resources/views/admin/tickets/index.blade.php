
@extends('admin.layouts.app')

@section('title', 'Support Tickets')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-2">Support Tickets</h1>
            <p class="mb-0">View and manage all user support tickets</p>
        </div>
    </div>
    <div class="card shadow-sm mb-4">
        <div class="card-header fw-bold">Support Tickets</div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table align-middle mb-0">
                    <thead>
                        <tr>
                            <th>Ticket ID</th>
                            <th>User</th>
                            <th>Subject</th>
                            <th>Status</th>
                            <th>Submitted Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($tickets as $ticket)
                        <tr>
                            <td>{{ $ticket->id }}</td>
                            <td>{{ $ticket->user->name }}</td>
                            <td>{{ $ticket->subject }}</td>
                            <td>
                                @if($ticket->status == 'open')
                                    <span class="badge bg-warning text-dark">Open</span>
                                @elseif($ticket->status == 'in_progress')
                                    <span class="badge bg-info text-dark">In Progress</span>
                                @elseif($ticket->status == 'resolved')
                                    <span class="badge bg-success">Resolved</span>
                                @else
                                    <span class="badge bg-secondary">Closed</span>
                                @endif
                            </td>
                            <td>{{ $ticket->created_at->format('Y-m-d H:i') }}</td>
                            <td>
                                <a href="{{ route('admin.tickets.show', $ticket->id) }}" class="btn btn-sm btn-outline-primary me-1">
                                    <i class="bi bi-eye"></i> View
                                </a>
                                @if($ticket->status != 'closed')
                                    <form action="{{ route('admin.tickets.close', $ticket->id) }}" method="POST" class="d-inline">
                                        @csrf
                                        <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Close this ticket?')">
                                            <i class="bi bi-x-circle"></i> Close
                                        </button>
                                    </form>
                                @endif
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="6" class="text-center text-muted">No support tickets found.</td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
            @if(method_exists($tickets, 'links'))
            <div class="card-footer bg-white py-3">
                <nav>
                    {!! $tickets->withQueryString()->links('pagination::bootstrap-5') !!}
                </nav>
            </div>
            @endif
        </div>
    </div>
</div>
@endsection