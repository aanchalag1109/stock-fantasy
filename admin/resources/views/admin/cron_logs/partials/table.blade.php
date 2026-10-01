@forelse($logs as $log)
@php
    $outputData = json_decode($log->output, true);
@endphp
<tr class="fade-in-row">
    <td class="ps-4">
        <span class="fw-bold text-primary">{{ \Carbon\Carbon::parse($log->run_time)->format('M d, Y') }}</span>
        <br>
        <small class="text-muted">{{ \Carbon\Carbon::parse($log->run_time)->format('H:m:s') }}</small>
    </td>
    <td>
        <span class="badge bg-light text-dark border">
            <i class="bi bi-gear-fill me-1"></i> {{ ucfirst($log->type) }}
        </span>
    </td>
    <td>
        @if($log->status === 'success')
            <span class="badge bg-success-soft text-success px-3">
                <i class="bi bi-check-circle-fill me-1"></i> Success
            </span>
        @else
            <span class="badge bg-danger-soft text-danger px-3">
                <i class="bi bi-x-circle-fill me-1"></i> Failed
            </span>
        @endif
    </td>
    <td style="min-width: 350px;">
        @if(is_array($outputData))
            <div class="cron-process-steps">
                @foreach($outputData as $phase => $steps)
                    @if(is_array($steps))
                        @foreach($steps as $step)
                            <div class="d-flex align-items-start mb-1">
                                <i class="bi bi-arrow-right-short text-muted mt-1"></i>
                                <span class="small text-dark">{{ $step }}</span>
                            </div>
                        @endforeach
                    @else
                         <div class="small text-muted">{{ $steps }}</div>
                    @endif
                @endforeach
            </div>
        @else
            <code class="small text-muted">{{ $log->output }}</code>
        @endif
    </td>
    <td class="pe-4 text-end">
        <div class="text-dark small fw-bold">{{ \Carbon\Carbon::parse($log->run_time)->diffForHumans() }}</div>
        <small class="text-muted" style="font-size: 0.7rem;">Completed</small>
    </td>
</tr>
@empty
<tr>
    <td colspan="5" class="text-center py-5 text-muted">
        <div class="mb-3">
            <i class="bi bi-clock-history display-4 opacity-25"></i>
        </div>
        <h5>No processed logs found</h5>
        <p class="small mb-0">The system is waiting for the next cron cycle.</p>
    </td>
</tr>
@endforelse

<style>
    .bg-success-soft { background-color: rgba(25, 135, 84, 0.1); }
    .bg-danger-soft { background-color: rgba(220, 53, 69, 0.1); }
    .cron-process-steps {
        background: #fdfdfd;
        border-left: 3px solid #e9ecef;
        padding: 8px 12px;
        border-radius: 0 4px 4px 0;
    }
</style>
