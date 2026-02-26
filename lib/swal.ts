import Swal from 'sweetalert2';

// Themed SweetAlert2 instance matching the PharmShift design system
const PharmSwal = Swal.mixin({
  customClass: {
    popup:           'pharmshift-swal-popup',
    title:           'pharmshift-swal-title',
    htmlContainer:   'pharmshift-swal-html',
    confirmButton:   'pharmshift-swal-confirm',
    cancelButton:    'pharmshift-swal-cancel',
    icon:            'pharmshift-swal-icon',
  },
  buttonsStyling: false,
  showClass: {
    popup: 'animate__animated animate__fadeInDown animate__faster',
  },
  hideClass: {
    popup: 'animate__animated animate__fadeOutUp animate__faster',
  },
});

export default PharmSwal;

// ── Convenience helpers ──────────────────────────────────────────────────────

export async function toastSuccess(message: string) {
  return Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    customClass: {
      popup: 'pharmshift-toast-success',
      timerProgressBar: 'pharmshift-toast-progress',
    },
    buttonsStyling: false,
  }).fire({ icon: 'success', title: message });
}

export async function toastError(message: string) {
  return Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 4000,
    timerProgressBar: true,
    customClass: {
      popup: 'pharmshift-toast-error',
      timerProgressBar: 'pharmshift-toast-progress',
    },
    buttonsStyling: false,
  }).fire({ icon: 'error', title: message });
}

export async function confirmAction(options: {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}): Promise<boolean> {
  const result = await PharmSwal.fire({
    title: options.title,
    text: options.text,
    icon: options.isDanger ? 'warning' : 'question',
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? 'ยืนยัน',
    cancelButtonText: options.cancelText ?? 'ยกเลิก',
  });
  return result.isConfirmed;
}
