import os

from mailersend import Email, EmailBuilder


class EmailService:
    _FROM_EMAIL = "noreply@horadofluxo.com.br"
    _FROM_NAME = "Spartacus"

    def send(self, to: str, subject: str, html: str) -> None:
        api_key = os.getenv("MAILERSEND_API_KEY", "")
        email_request = (
            EmailBuilder()
            .from_email(self._FROM_EMAIL, self._FROM_NAME)
            .to(to)
            .subject(subject)
            .html(html)
            .build()
        )
        Email(api_key=api_key).send(email_request)
