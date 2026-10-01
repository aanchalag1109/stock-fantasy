
@extends('admin.layouts.app')

@section('title', 'Ticket Details')

@section('content')
<div class="container-fluid">
    <div class="row justify-content-center">
        <div class="col-lg-8">
            <div class="card shadow-sm mb-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="fw-bold">Ticket #{{ $ticket->id }}: {{ $ticket->subject }}</span>
                    <span>
                        @if($ticket->status == 'open')
                            <span class="badge bg-warning text-dark">Open</span>
                        @elseif($ticket->status == 'in_progress')
                            <span class="badge bg-info text-dark">In Progress</span>
                        @elseif($ticket->status == 'resolved')
                            <span class="badge bg-success">Resolved</span>
                        @else
                            <span class="badge bg-secondary">Closed</span>
                        @endif
                    </span>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <ul class="list-group list-group-flush">
                            <li class="list-group-item"><strong>User:</strong> {{ $ticket->user->name }}</li>
                            <li class="list-group-item"><strong>Submitted:</strong> {{ $ticket->created_at->format('Y-m-d H:i') }}</li>
                        </ul>
                    </div>
                    <h5 class="mb-3">Conversation</h5>
                    <div class="border rounded p-3 mb-4 bg-light">
                        <div class="mb-2">
                            <strong>{{ $ticket->user->name }}:</strong> {{ $ticket->message }}
                        </div>
                        @foreach($ticket->replies as $reply)
                            <hr>
                            <div class="mb-2">
                                <strong>{{ $reply->user ? $reply->user->name : ($reply->admin ? $reply->admin->name . ' (Admin)' : 'Unknown') }}:</strong> {{ $reply->message }}
                            </div>
                        @endforeach
                    </div>
                    <div class="d-flex gap-2 mt-3">
                        <a href="{{ route('admin.tickets.index') }}" class="btn btn-outline-secondary">
                            <i class="bi bi-arrow-left"></i> Back to Tickets List
                        </a>
                        @if($ticket->status != 'closed')
                            <button class="btn btn-outline-primary" type="button" data-bs-toggle="collapse" data-bs-target="#replyForm" aria-expanded="false" aria-controls="replyForm">
                                <i class="bi bi-reply"></i> Reply
                            </button>
                            <form action="{{ route('admin.tickets.close', $ticket->id) }}" method="POST" class="d-inline">
                                @csrf
                                <button type="submit" class="btn btn-danger" onclick="return confirm('Close this ticket?')">
                                    <i class="bi bi-x-circle"></i> Close Ticket
                                </button>
                            </form>
                        @endif
                    </div>
                    @if($ticket->status != 'closed')
                    <div class="collapse mt-4" id="replyForm">
                        <div class="card card-body">
                            <form method="POST" action="{{ route('admin.tickets.reply', $ticket->id) }}">
                                @csrf
                                <div class="mb-3">
                                    <label for="replyMessage" class="form-label">Your Reply</label>
                                    <textarea name="message" id="replyMessage" class="form-control" rows="4" required></textarea>
                                </div>
                                <button type="submit" class="btn btn-success">
                                    <i class="bi bi-send"></i> Send Reply
                                </button>
                            </form>
                        </div>
                    </div>
                    @endif
                </div>
            </div>
        </div>
    </div>
</div>
@endsection