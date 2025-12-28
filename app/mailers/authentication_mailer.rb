class AuthenticationMailer < ApplicationMailer
  def magic_link(identity, magic_link)
    @code = magic_link.code
    @expires_in = "15 minutes"

    mail(
      to: identity.email_address,
      subject: "Your Debrief sign-in code: #{@code}"
    )
  end
end
