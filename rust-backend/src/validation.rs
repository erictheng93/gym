use crate::error::AppError;

pub fn required_text(field: &str, value: &str) -> Result<(), AppError> {
    if value.trim().is_empty() {
        return Err(AppError::Validation(format!("{field} is required")));
    }

    Ok(())
}

pub fn positive_u32(field: &str, value: u32) -> Result<(), AppError> {
    if value == 0 {
        return Err(AppError::Validation(format!("{field} must be greater than zero")));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_blank_required_text() {
        let result = required_text("name", "   ");

        assert!(result.is_err());
    }

    #[test]
    fn accepts_non_blank_required_text() {
        let result = required_text("name", "Gym");

        assert!(result.is_ok());
    }

    #[test]
    fn rejects_zero_positive_number() {
        let result = positive_u32("limit", 0);

        assert!(result.is_err());
    }
}
