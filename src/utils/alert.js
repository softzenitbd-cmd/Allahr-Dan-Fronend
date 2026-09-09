import Swal from 'sweetalert2';

/**
 * Modern SweetAlert confirmation dialog
 * @param {Object} options
 * @param {string} options.title - Alert title
 * @param {string} options.text - Alert description
 * @param {string} [options.confirmButtonText] - Confirm button text
 * @param {string} [options.cancelButtonText] - Cancel button text
 * @param {boolean} [options.isDanger=true] - If true, confirm button is red/danger
 * @param {string} [options.icon='warning'] - Alert icon
 * @returns {Promise<boolean>} Resolves to true if confirmed, false otherwise
 */
export const showConfirmDialog = async ({
  title,
  text,
  confirmButtonText = 'হ্যাঁ, নিশ্চিত',
  cancelButtonText = 'বাতিল',
  isDanger = true,
  icon = 'warning',
}) => {
  const result = await Swal.fire({
    title: title || (isDanger ? 'আপনি কি নিশ্চিত?' : 'নিশ্চিত করুন'),
    text: text || '',
    icon,
    showCancelButton: true,
    confirmButtonColor: isDanger ? '#ef4444' : '#6366f1',
    cancelButtonColor: '#64748b',
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    focusCancel: true,
    padding: '1.5rem',
    borderRadius: '16px',
    customClass: {
      popup: 'swal2-modern-card',
      confirmButton: 'swal2-modern-btn swal2-btn-confirm',
      cancelButton: 'swal2-modern-btn swal2-btn-cancel',
    },
  });

  return result.isConfirmed;
};

/**
 * Modern SweetAlert success toast / modal
 */
export const showSuccessAlert = (title, text = '') => {
  return Swal.fire({
    icon: 'success',
    title: title || 'সফল হয়েছে!',
    text: text || '',
    timer: 2000,
    timerProgressBar: true,
    showConfirmButton: false,
    padding: '1.5rem',
    borderRadius: '16px',
    customClass: {
      popup: 'swal2-modern-card',
    },
  });
};

/**
 * Modern SweetAlert error modal
 */
export const showErrorAlert = (title, text = '') => {
  return Swal.fire({
    icon: 'error',
    title: title || 'ত্রুটি হয়েছে!',
    text: text || '',
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'ঠিক আছে',
    padding: '1.5rem',
    borderRadius: '16px',
    customClass: {
      popup: 'swal2-modern-card',
    },
  });
};

export default Swal;
