@extends('admin.layouts.app')
@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h3 mb-0"><i class="bi bi-bookmark me-2"></i>Saved Templates</h1>
        <a href="{{ route('admin.league_sessions.create') }}" class="btn btn-primary">
            <i class="bi bi-plus-circle me-1"></i>Create New Session
        </a>
    </div>

    <div class="card shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th class="fw-semibold">Template Name</th>
                            <th class="fw-semibold">Session Name</th>
                            <th class="fw-semibold">Market Type</th>
                            <th class="fw-semibold">Max Assets</th>
                            <th class="fw-semibold">Created</th>
                            <th class="fw-semibold text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($templates as $template)
                        <tr>
                            <td>
                                <div class="fw-semibold text-primary">{{ $template->template_name }}</div>
                            </td>
                            <td>{{ $template->name }}</td>
                            <td>
                                <span class="badge {{ $template->market_type == 'stock' ? 'bg-primary' : 'bg-warning' }}">
                                    <i class="bi bi-{{ $template->market_type == 'stock' ? 'graph-up' : 'currency-bitcoin' }} me-1"></i>
                                    {{ ucfirst($template->market_type) }}
                                </span>
                            </td>
                            <td><span class="badge bg-light text-dark">{{ $template->max_stocks }}</span></td>
                            <td>{{ $template->created_at->format('M j, Y') }}</td>
                            <td class="text-center">
                                <div class="btn-group btn-group-sm">
                                    <a href="{{ route('admin.league_sessions.create') }}?template={{ $template->id }}" class="btn btn-outline-primary" title="Use Template">
                                        <i class="bi bi-arrow-right"></i>
                                    </a>
                                    <a href="{{ route('admin.templates.edit', $template) }}" class="btn btn-outline-warning" title="Edit Template">
                                        <i class="bi bi-pencil"></i>
                                    </a>
                                    <form action="{{ route('admin.templates.destroy', $template) }}" method="POST" class="d-inline">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="btn btn-outline-danger" title="Delete Template" onclick="return confirm('Are you sure you want to delete this template?')">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="6" class="text-center py-5">
                                <div class="text-muted">
                                    <i class="bi bi-bookmark display-1 d-block mb-3"></i>
                                    <h5>No templates found</h5>
                                    <p>Create a session and save it as template to get started.</p>
                                    <a href="{{ route('admin.league_sessions.create') }}" class="btn btn-primary">
                                        <i class="bi bi-plus-circle me-1"></i>Create New Session
                                    </a>
                                </div>
                            </td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
@endsection