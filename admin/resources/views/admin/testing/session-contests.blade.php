@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header d-flex justify-content-between">
                    <div>
                        <h5 class="mb-0">Contests in {{ $session->name }}</h5>
                        <small class="text-muted">Session ID: {{ $session->id }}</small>
                    </div>
                    <a href="{{ route('admin.testing.index') }}" class="btn btn-sm btn-outline-secondary">Back to Testing</a>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Category</th>
                                    <th>Entry Fee</th>
                                    <th>Participants</th>
                                    <th>Created</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse($contests as $contest)
                                <tr>
                                    <td>{{ $contest->id }}</td>
                                    <td>{{ $contest->category }}</td>
                                    <td>{{ $contest->entry_fee }}</td>
                                    <td>{{ $contest->participants }}</td>
                                    <td>{{ date('M d, H:i', strtotime($contest->created_at)) }}</td>
                                    <td>
                                        <a href="{{ route('admin.testing.contest-detail', $contest->id) }}" class="btn btn-xs btn-outline-primary">View</a>
                                    </td>
                                </tr>
                                @empty
                                <tr>
                                    <td colspan="6" class="text-center text-muted">No contests found for this session.</td>
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