@extends('admin.layouts.app')

@section('title', 'View Announcement')

@section('content')
<div class="container-fluid">
    <div class="row justify-content-center">
        <div class="col-lg-8">
            <div class="card shadow-sm mb-4">
                <div class="card-header fw-bold">Announcement Details</div>
                <div class="card-body">
                    <div class="row mb-3">
                        <div class="col-sm-3"><strong>Title:</strong></div>
                        <div class="col-sm-9">{{ $announcement->title }}</div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-sm-3"><strong>Type:</strong></div>
                        <div class="col-sm-9">
                            @if($announcement->type == 'update')
                                <span class="badge bg-info text-dark">Update</span>
                            @elseif($announcement->type == 'alert')
                                <span class="badge bg-danger">Alert</span>
                            @elseif($announcement->type == 'promo')
                                <span class="badge bg-success">Promo</span>
                            @else
                                <span class="badge bg-secondary">Other</span>
                            @endif
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-sm-3"><strong>Description:</strong></div>
                        <div class="col-sm-9">{{ $announcement->description }}</div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-sm-3"><strong>Created:</strong></div>
                        <div class="col-sm-9">{{ $announcement->created_at->format('Y-m-d H:i:s') }}</div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-sm-3"><strong>Updated:</strong></div>
                        <div class="col-sm-9">{{ $announcement->updated_at->format('Y-m-d H:i:s') }}</div>
                    </div>
                    
                    <div class="d-flex gap-2 mt-4">
                        <a href="{{ route('admin.announcements.index') }}" class="btn btn-outline-secondary">
                            <i class="bi bi-arrow-left"></i> Back to List
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection